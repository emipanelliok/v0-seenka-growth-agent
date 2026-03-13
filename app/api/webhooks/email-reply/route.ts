import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

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
    // Get champion details and last message sent
    const { data: championData } = await supabase
      .from("champions")
      .select("*, champion_clients(client_name)")
      .eq("id", matchedChampion.id)
      .single()

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

    // Agentic LLM: Analyze reply and generate appropriate response
    const analysis = await analyzeAndGenerateResponse(
      replyContent,
      subject,
      championData,
      lastOutreach?.message || lastInteraction?.message
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
          champion_id: matchedChampion.id,
          trigger_id: null,
          channel: "email",
          message: analysis.generatedResponse,
          subject_line: analysis.suggestedSubject || `Re: ${subject || "Seguimiento"}`,
          status: "pending_review", // Goes to bandeja for approval
          priority: analysis.action === "schedule_call" ? 1 : 2,
          metadata: {
            auto_generated: true,
            reply_to: subject,
            intent_detected: analysis.intent,
            action_type: analysis.action,
            reasoning: analysis.reasoning
          }
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
  lastMessageSent: string | null
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

  try {
    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      prompt: `Eres un agente de ventas experto de Seenka, una plataforma de inteligencia publicitaria que monitorea inversión en medios, competencia, y creatividades.

CONTEXTO DEL CHAMPION:
- Nombre: ${champion?.name || "Desconocido"}
- Empresa: ${champion?.company || "No especificada"}
- Cargo: ${champion?.title || "No especificado"}
- Clientes que maneja: ${championClients}

ÚLTIMO MENSAJE QUE LE ENVIAMOS:
${lastMessageSent?.substring(0, 500) || "No disponible"}

SU RESPUESTA:
Subject: ${subject || "(sin asunto)"}
Contenido: ${replyContent}

ANALIZA LA RESPUESTA Y RESPONDE EN JSON:
{
  "intent": "string - qué quiere/necesita la persona (ej: mas_info, quien_es_seenka, agendar_llamada, no_interesado, no_es_momento, ya_tiene_solucion, pregunta_precio, reenviar_a_otro, out_of_office)",
  "sentiment": "positive | negative | neutral",
  "action": "string - qué acción tomar (ej: send_more_info, explain_seenka, schedule_call, send_pricing, close_lost, reactivate_later, forward_contact, wait)",
  "reasoning": "string breve explicando por qué elegiste esa acción",
  "generatedResponse": "string - el email de respuesta personalizado que deberíamos enviar (null si action es close_lost o wait). Máximo 150 palabras. Tono profesional pero cercano. Incluye datos relevantes si aplica. NO uses emojis.",
  "suggestedSubject": "string - asunto sugerido para el email de respuesta (null si no hay response)"
}

REGLAS PARA LA RESPUESTA GENERADA:
- Si pregunta quién es Seenka: Explica brevemente que somos plataforma de inteligencia publicitaria, monitoreamos inversión en medios de sus competidores y el mercado
- Si muestra interés: Propone una llamada de 15 min para mostrarle datos de su industria
- Si dice "no es momento": Responde amable, ofrece retomar en el futuro, no insistas
- Si no está interesado: Cierra amablemente, no generes respuesta (action: close_lost)
- Si pide más info: Comparte valor sobre lo que podemos mostrarle de sus competidores
- Si reenvía a otro: Agradece y pide el contacto correcto

Responde SOLO el JSON, sin markdown ni explicaciones adicionales.`,
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



// GET endpoint to test webhook is working
export async function GET() {
  return NextResponse.json({ 
    status: "ok", 
    endpoint: "/api/webhooks/email-reply",
    description: "POST email replies here to track responses and advance sequences"
  })
}
