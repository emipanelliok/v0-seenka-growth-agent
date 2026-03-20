import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { buildPlaybook } from "@/lib/gaston-playbook"

// Webhook to receive email replies from Resend, Doppler, or Make
// POST /api/webhooks/email-reply

interface EmailReplyPayload {
  // Common fields
  from_email: string
  to_email?: string
  subject?: string
  body?: string
  text?: string
  html?: string
  received_at?: string
  
  // Resend specific
  type?: string
  data?: {
    from?: string
    to?: string[]
    subject?: string
    text?: string
    created_at?: string
  }
  
  // Make/Zapier can send any format, we normalize it
  email?: string
  content?: string
  message?: string
}

export async function POST(request: NextRequest) {
  try {
    const payload: EmailReplyPayload = await request.json()
    
    console.log("[v0] Webhook received:", JSON.stringify(payload, null, 2))
    
    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    )
    
    // Normalize the email and content from different providers
    const fromEmail = normalizeEmail(payload)
    const replyContent = normalizeContent(payload)
    const subject = normalizeSubject(payload)
    
    console.log("[v0] Normalized - From:", fromEmail, "Content:", replyContent?.substring(0, 100), "Subject:", subject)
    
    if (!fromEmail) {
      console.log("[v0] Error: No from_email provided")
      return NextResponse.json({ error: "No from_email provided" }, { status: 400 })
    }

    // Find champion by email (case-insensitive)
    const { data: champions, error: championError } = await supabase
      .from("champions")
      .select("id, name, email, status")
      .ilike("email", fromEmail.trim())
      .limit(1)

    console.log("[v0] Champion search:", { championError, found: champions?.length || 0, searchEmail: fromEmail })

    let matchedChampion = champions?.[0] || null

    // If exact match failed, try partial match
    if (!matchedChampion) {
      const emailUsername = fromEmail.split("@")[0]
      const { data: partialMatches } = await supabase
        .from("champions")
        .select("id, name, email, status")
        .ilike("email", `%${emailUsername}%`)
        .limit(1)
      
      console.log("[v0] Partial match attempt:", { found: partialMatches?.length || 0 })
      matchedChampion = partialMatches?.[0] || null
    }

    if (!matchedChampion) {
      console.log("[v0] No champion found with email:", fromEmail)
      return NextResponse.json({ 
        status: "not_found", 
        message: `No champion found with email: ${fromEmail}` 
      }, { status: 200 })
    }

    console.log("[v0] Found champion:", matchedChampion.name, matchedChampion.email)
    
    // Extract signature data from the FULL email (before stripping)
    const fullBody = payload.body || payload.text || payload.content || payload.message || payload.data?.text || ""
    await extractAndEnrichFromSignature(supabase, matchedChampion.id, fullBody)

    return await processReply(supabase, matchedChampion, replyContent, subject)

  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ 
      error: "Internal error processing reply",
      details: String(error)
    }, { status: 500 })
  }
}

// Process reply from champion with agentic LLM
async function processReply(supabase: any, matchedChampion: any, replyContent: string | null, subject: string | null) {
  try {
    // Get champion details and the owning user_id (needed for outreach_queue inserts)
    const { data: championData } = await supabase
      .from("champions")
      .select("*, champion_clients(client_name)")
      .eq("id", matchedChampion.id)
      .single()

    // user_id is required for outreach_queue — get it from the champion's owner
    const ownerId = championData?.user_id
    if (!ownerId) {
      console.log("[v0] Warning: champion has no user_id")
    }

    // Find the most recent interaction/message sent to this champion
    const { data: lastInteraction } = await supabase
      .from("interactions")
      .select("id, channel, message, created_at")
      .eq("champion_id", matchedChampion.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    // Get the last outreach message sent
    const { data: lastOutreach } = await supabase
      .from("outreach_queue")
      .select("message, subject_line")
      .eq("champion_id", matchedChampion.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .single()

    // Build playbook from past interactions
    const playbook = await buildPlaybook(supabase)

    // Agentic LLM: Analyze reply and generate appropriate response
    const analysis = await analyzeAndGenerateResponse(
      replyContent,
      subject,
      championData,
      lastOutreach?.message || lastInteraction?.message,
      playbook
    )

    console.log("[v0] LLM Analysis:", JSON.stringify(analysis, null, 2))

    // Update the last interaction with reply data
    if (lastInteraction) {
      await supabase
        .from("interactions")
        .update({
          reply_received_at: new Date().toISOString(),
          reply_content: replyContent,
          reply_sentiment: analysis.sentiment,
          outcome: "responded"
        })
        .eq("id", lastInteraction.id)
    }

    // Update champion status based on analysis
    const newStatus = analysis.action === "close_won" ? "opportunity" 
                    : analysis.action === "close_lost" ? "rejected"
                    : "responded"
    
    await supabase
      .from("champions")
      .update({ status: newStatus })
      .eq("id", matchedChampion.id)

    // If LLM generated a response, save it as draft in outreach_queue
    if (analysis.generatedResponse && analysis.action !== "close_lost") {
      const { error: queueError } = await supabase
        .from("outreach_queue")
        .insert({
          user_id: ownerId,
          champion_id: matchedChampion.id,
          channel: "email",
          message: analysis.generatedResponse,
          subject_line: analysis.suggestedSubject || `Re: ${subject || "Seguimiento"}`,
          status: "pending_review"
        })
      
      if (queueError) {
        console.log("[v0] Error creating draft response:", queueError)
      } else {
        console.log("[v0] Draft response created in outreach_queue")
      }
    }

    // Save sequence info for tracking
    const { data: existingSequence } = await supabase
      .from("champion_sequences")
      .select("id")
      .eq("champion_id", matchedChampion.id)
      .neq("status", "completed")
      .neq("status", "stopped")
      .limit(1)
      .single()

    if (!existingSequence) {
      const { data: defaultSequence } = await supabase
        .from("sequences")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (defaultSequence) {
        await supabase
          .from("champion_sequences")
          .insert({
            champion_id: matchedChampion.id,
            sequence_id: defaultSequence.id,
            metadata: { 
              intent: analysis.intent,
              action: analysis.action,
              sentiment: analysis.sentiment,
              reasoning: analysis.reasoning
            },
            status: analysis.action === "close_lost" ? "stopped" : "active",
            current_step: 1,
            started_at: new Date().toISOString(),
            last_step_at: new Date().toISOString(),
            next_step_at: analysis.action === "reactivate_later" 
              ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
              : new Date().toISOString(),
          })
      }
    } else {
      await supabase
        .from("champion_sequences")
        .update({ 
          metadata: { 
            intent: analysis.intent,
            action: analysis.action,
            sentiment: analysis.sentiment,
            reasoning: analysis.reasoning
          },
          status: analysis.action === "close_lost" ? "stopped" : "active",
        })
        .eq("id", existingSequence.id)
    }

    return NextResponse.json({
      status: "success",
      champion_id: matchedChampion.id,
      champion_name: matchedChampion.name,
      analysis: {
        intent: analysis.intent,
        action: analysis.action,
        sentiment: analysis.sentiment,
        has_draft_response: !!analysis.generatedResponse
      },
      message: "Reply processed with AI agent"
    })
  } catch (error) {
    console.error("[v0] Error in processReply:", error)
    throw error
  }
}

// Agentic LLM: Analyze the reply and generate appropriate response
async function analyzeAndGenerateResponse(
  replyContent: string | null,
  subject: string | null,
  champion: any,
  lastMessageSent: string | null,
  playbook: string = ""
): Promise<{
  intent: string
  sentiment: string
  action: string
  reasoning: string
  generatedResponse: string | null
  suggestedSubject: string | null
}> {
  if (!replyContent) {
    return {
      intent: "unknown",
      sentiment: "neutral",
      action: "wait",
      reasoning: "No content in reply",
      generatedResponse: null,
      suggestedSubject: null
    }
  }

  const championClients = champion?.champion_clients?.map((c: any) => c.client_name).join(", ") || "no especificados"

  // Strip email signature and quoted thread before sending to LLM
  function stripEmailNoise(text: string): string {
    const lines = text.split("\n")
    const out: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (/^On .+ wrote:/i.test(t)) break
      if (/^El .+(escribi[oó]:|wrote:)/i.test(t)) break
      if (/^--\s*$/.test(t)) break
      if (/^-{3,}/.test(t) || /^_{3,}/.test(t)) break
      if (t.startsWith(">")) continue
      if (i > 0 && /^\+\d[\d\s]{6,}$/.test(t)) break
      if (/^(Agendemos|Agendamos)\s/i.test(t)) break
      out.push(lines[i])
    }
    while (out.length && out[out.length - 1].trim() === "") out.pop()
    return out.join("\n").trim()
  }

  const cleanReply = stripEmailNoise(replyContent)

  try {
    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      prompt: `Sos Gastón, agente de inteligencia publicitaria de Seenka. Seenka es una plataforma que monitorea en tiempo real qué están comunicando las marcas en TV, digital y radio en toda Latinoamérica — creatividades, mensajes, presencia en medios.

CONTEXTO:
- Estás hablando con ${champion?.name || "esta persona"} (${champion?.title || "ejecutivo"} en ${champion?.company || "su empresa"})
- Clientes que maneja: ${championClients}

MENSAJE QUE VOS LE MANDASTE:
${lastMessageSent?.substring(0, 400) || "No disponible"}

SU RESPUESTA:
${cleanReply}

ANALIZÁ LA RESPUESTA Y RESPONDÉ EN JSON:
{
  "intent": "string - qué quiere/necesita (ej: quien_es_seenka, mas_info, agendar_llamada, no_interesado, no_es_momento, ya_tiene_solucion, pregunta_precio, reenviar_a_otro, out_of_office)",
  "sentiment": "positive | negative | neutral",
  "action": "string - qué hacer (ej: explain_seenka, send_more_info, schedule_call, close_lost, reactivate_later, wait)",
  "reasoning": "string breve",
  "generatedResponse": "string - tu respuesta como Gastón (null si action es close_lost). Máx 80 palabras. Español argentino con voseo. Sin emojis. Firmá como 'Gastón\\nSeenka Media Intelligence'.",
  "suggestedSubject": "string - asunto del email (null si no hay respuesta)"
}

CÓMO RESPONDER SEGÚN LA SITUACIÓN:
- '¿Quiénes son?' / '¿De qué me sirve?': Explicá que Seenka monitorea qué comunican las marcas en medios (TV, digital, radio) en tiempo real. Ofrecé $500 USD en créditos con el link y código.
- Muestra interés / quiere avanzar: Mandale directo los $500 USD en créditos para que explore con su equipo: link seenka.com/refer + generá un código único tipo G seguido de 7 caracteres alfanuméricos random (ej: G7KM2X9P). Mencioná que si después quiere ver datos específicos de sus competidores, pueden agendar una charla de 15 min.
- Pide más info: Compartí valor concreto sobre lo que podemos mostrarle de sus competidores + ofrecé los créditos.
- 'No es el momento': Respondé amable, dejá la puerta abierta, no insistas.
- No interesado / muy negativo: action close_lost, generatedResponse null.
- IMPORTANTE: Siempre priorizá dar valor inmediato (créditos, datos) antes de pedir una reunión. La llamada es opcional, nunca el primer paso.
${playbook}
Respondé SOLO el JSON, sin markdown ni texto extra.`,
      maxTokens: 1000
    })

    // Parse JSON response
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const analysis = JSON.parse(cleanedText)
    
    return {
      intent: analysis.intent || "unknown",
      sentiment: analysis.sentiment || "neutral",
      action: analysis.action || "wait",
      reasoning: analysis.reasoning || "",
      generatedResponse: analysis.generatedResponse || null,
      suggestedSubject: analysis.suggestedSubject || null
    }
  } catch (error) {
    console.error("[v0] Error in agentic analysis:", error)
    return {
      intent: "error",
      sentiment: "neutral",
      action: "wait",
      reasoning: "Error analyzing reply",
      generatedResponse: null,
      suggestedSubject: null
    }
  }
}

// Normalize email from different payload formats
function normalizeEmail(payload: EmailReplyPayload): string | null {
  if (payload.from_email) return payload.from_email
  if (payload.email) return payload.email
  if (payload.data?.from) return payload.data.from
  return null
}

// Normalize content from different payload formats
function normalizeContent(payload: EmailReplyPayload): string | null {
  if (payload.body) return payload.body
  if (payload.text) return payload.text
  if (payload.content) return payload.content
  if (payload.message) return payload.message
  if (payload.data?.text) return payload.data.text
  if (payload.html) return stripHtml(payload.html)
  return null
}

// Normalize subject from different payload formats
function normalizeSubject(payload: EmailReplyPayload): string | null {
  if (payload.subject) return payload.subject
  if (payload.data?.subject) return payload.data.subject
  return null
}

// Strip HTML tags for plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}



// Extract contact info from email signature and enrich champion profile
async function extractAndEnrichFromSignature(supabase: any, championId: string, fullBody: string) {
  try {
    if (!fullBody || fullBody.length < 20) return

    // Get current champion data to know what's missing
    const { data: champ } = await supabase
      .from("champions")
      .select("phone, linkedin_url, title, company, website")
      .eq("id", championId)
      .single()

    if (!champ) return

    const updates: Record<string, string> = {}

    // Extract phone numbers (Argentina, international, etc.)
    if (!champ.phone) {
      const phoneMatch = fullBody.match(/(?:(?:\+|00)\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/)
      // More specific: look for phone patterns near signature area
      const signatureArea = extractSignatureArea(fullBody)
      if (signatureArea) {
        const phoneInSig = signatureArea.match(/(?:(?:Tel|Cel|Phone|Mobile|Ph|T|M)[.:]*\s*)?(\+?\d[\d\s()./-]{7,18}\d)/i)
        if (phoneInSig) {
          const cleanPhone = phoneInSig[1].replace(/[^\d+]/g, "")
          if (cleanPhone.length >= 8) {
            updates.phone = phoneInSig[1].trim()
            console.log("[v0] Extracted phone from signature:", updates.phone)
          }
        }
      }
    }

    // Extract LinkedIn URL
    if (!champ.linkedin_url) {
      const linkedinMatch = fullBody.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i)
      if (linkedinMatch) {
        updates.linkedin_url = linkedinMatch[0]
        console.log("[v0] Extracted LinkedIn from signature:", updates.linkedin_url)
      }
    }

    // Extract website
    if (!champ.website) {
      const signatureArea = extractSignatureArea(fullBody)
      if (signatureArea) {
        // Look for URLs that aren't linkedin/google/social media
        const urlMatch = signatureArea.match(/https?:\/\/(?:www\.)?(?!linkedin|facebook|twitter|instagram|google|outlook|microsoft)[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-z]{2,}[^\s)"]*/i)
        if (urlMatch) {
          updates.website = urlMatch[0]
          console.log("[v0] Extracted website from signature:", updates.website)
        }
      }
    }

    // Extract title/role from signature
    if (!champ.title) {
      const signatureArea = extractSignatureArea(fullBody)
      if (signatureArea) {
        // Common patterns: "Name\nTitle\nCompany" or "Name | Title | Company"
        const titlePatterns = [
          /(?:^|\n)\s*(?:CEO|CTO|COO|CFO|CMO|VP|Director|Head|Manager|Gerente|Jefe|Coordinador|Líder|Fundador|Co-?Founder|Partner|Socio|Analista|Ejecutiv[oa]|Responsable|Lead|Senior|Sr\.?|Jr\.?)[^\n]{0,60}/im,
          /(?:Cargo|Position|Title|Rol)[:\s]+([^\n]+)/i,
        ]
        for (const pattern of titlePatterns) {
          const match = signatureArea.match(pattern)
          if (match) {
            const title = (match[1] || match[0]).trim().replace(/^[\s|·—-]+/, "").trim()
            if (title.length > 3 && title.length < 80) {
              updates.title = title
              console.log("[v0] Extracted title from signature:", updates.title)
              break
            }
          }
        }
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("champions")
        .update(updates)
        .eq("id", championId)

      if (error) {
        console.error("[v0] Error enriching champion from signature:", error)
      } else {
        console.log("[v0] Champion enriched from email signature:", Object.keys(updates).join(", "))
      }
    }
  } catch (err) {
    console.error("[v0] Error in extractAndEnrichFromSignature:", err)
  }
}

// Extract the signature portion of an email (after -- or last block of text)
function extractSignatureArea(body: string): string | null {
  // Try standard signature delimiter
  const sigDelimiter = body.indexOf("\n-- \n")
  if (sigDelimiter !== -1) {
    return body.substring(sigDelimiter)
  }
  const sigDelimiter2 = body.indexOf("\n--\n")
  if (sigDelimiter2 !== -1) {
    return body.substring(sigDelimiter2)
  }

  // Try "---" separator
  const dashSep = body.lastIndexOf("\n---")
  if (dashSep !== -1 && dashSep > body.length * 0.4) {
    return body.substring(dashSep)
  }

  // Fallback: last 30% of the email usually contains the signature
  const lines = body.split("\n")
  const startLine = Math.floor(lines.length * 0.6)
  return lines.slice(startLine).join("\n")
}

// GET endpoint to test webhook is working
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/email-reply",
    description: "POST email replies here to track responses and advance sequences"
  })
}
