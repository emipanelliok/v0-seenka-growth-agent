import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

// Webhook to receive LinkedIn messages from Unipile
// POST /api/webhooks/linkedin-reply
// Configure in Unipile dashboard: Messaging > Webhooks

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    console.log("[linkedin-webhook] Received:", JSON.stringify(payload, null, 2))

    // Unipile sends different event types — we only care about new messages
    const eventType = payload.event || payload.type || ""
    if (eventType && !["messaging.message.created", "message.received", "new_message"].includes(eventType)) {
      return NextResponse.json({ status: "ignored", event: eventType })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    )

    // Normalize sender info from Unipile payload
    // Unipile format: payload.account_id, payload.message.sender.identifier, payload.message.text
    const senderIdentifier = normalizeSenderIdentifier(payload)
    const messageText = normalizeMessageText(payload)

    console.log("[linkedin-webhook] Sender:", senderIdentifier, "Text:", messageText?.substring(0, 100))

    if (!senderIdentifier) {
      return NextResponse.json({ error: "No sender identifier" }, { status: 400 })
    }

    // Skip our own messages (sent by us via Unipile)
    const ourAccountId = process.env.UNIPILE_LINKEDIN_ACCOUNT_ID || ""
    if (isOurOwnMessage(payload, ourAccountId)) {
      console.log("[linkedin-webhook] Skipping own message")
      return NextResponse.json({ status: "skipped", reason: "own_message" })
    }

    // Find champion by LinkedIn URL or name
    const matchedChampion = await findChampionByLinkedIn(supabase, senderIdentifier, payload)

    if (!matchedChampion) {
      console.log("[linkedin-webhook] No champion found for:", senderIdentifier)
      return NextResponse.json({ status: "not_found", sender: senderIdentifier }, { status: 200 })
    }

    console.log("[linkedin-webhook] Matched champion:", matchedChampion.name)

    return await processLinkedInReply(supabase, matchedChampion, messageText, payload)

  } catch (error) {
    console.error("[linkedin-webhook] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

async function findChampionByLinkedIn(supabase: any, senderIdentifier: string, payload: any) {
  // Try by linkedin_url containing the identifier
  const { data: byUrl } = await supabase
    .from("champions")
    .select("id, name, company, role, email, linkedin_url")
    .ilike("linkedin_url", `%${senderIdentifier}%`)
    .limit(1)

  if (byUrl?.[0]) return byUrl[0]

  // Try by sender name if available
  const senderName = normalizeSenderName(payload)
  if (senderName) {
    const nameParts = senderName.trim().split(/\s+/)
    const firstName = nameParts[0]
    const { data: byName } = await supabase
      .from("champions")
      .select("id, name, company, role, email, linkedin_url")
      .ilike("name", `%${firstName}%`)
      .limit(1)

    if (byName?.[0]) return byName[0]
  }

  return null
}

async function processLinkedInReply(supabase: any, champion: any, messageText: string | null, payload: any) {
  // Get champion with user_id (needed for outreach_queue inserts)
  const { data: fullChampion } = await supabase
    .from("champions")
    .select("user_id")
    .eq("id", champion.id)
    .single()
  const ownerId = fullChampion?.user_id

  // Get last interaction for this champion
  const { data: lastInteraction } = await supabase
    .from("interactions")
    .select("id, channel, message, created_at")
    .eq("champion_id", champion.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  // Get last outreach sent
  const { data: lastOutreach } = await supabase
    .from("outreach_queue")
    .select("message, subject_line")
    .eq("champion_id", champion.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single()

  // Analyze with LLM
  const analysis = await analyzeLinkedInReply(
    messageText,
    champion,
    lastOutreach?.message || lastInteraction?.message
  )

  console.log("[linkedin-webhook] Analysis:", JSON.stringify(analysis, null, 2))

  // Update last interaction
  if (lastInteraction) {
    await supabase
      .from("interactions")
      .update({
        reply_received_at: new Date().toISOString(),
        reply_content: messageText,
        reply_sentiment: analysis.sentiment,
        outcome: "responded",
      })
      .eq("id", lastInteraction.id)
  } else {
    // Create new interaction record for this reply
    await supabase.from("interactions").insert({
      champion_id: champion.id,
      channel: "linkedin",
      message: "[Mensaje entrante de LinkedIn]",
      reply_content: messageText,
      reply_sentiment: analysis.sentiment,
      reply_received_at: new Date().toISOString(),
      outcome: "responded",
    })
  }

  // Update champion status
  const newStatus =
    analysis.action === "close_won" ? "opportunity"
    : analysis.action === "close_lost" ? "rejected"
    : "responded"

  await supabase.from("champions").update({ status: newStatus }).eq("id", champion.id)

  // Save Gastón's draft response
  if (analysis.generatedResponse && analysis.action !== "close_lost") {
    await supabase.from("outreach_queue").insert({
      user_id: ownerId,
      champion_id: champion.id,
      channel: "linkedin",
      message: analysis.generatedResponse,
      subject_line: null,
      status: "pending_review",
    })
    console.log("[linkedin-webhook] Draft response saved to outreach_queue")
  }

  return NextResponse.json({
    status: "success",
    champion_id: champion.id,
    champion_name: champion.name,
    analysis: {
      intent: analysis.intent,
      action: analysis.action,
      sentiment: analysis.sentiment,
      has_draft: !!analysis.generatedResponse,
    },
  })
}

async function analyzeLinkedInReply(
  messageText: string | null,
  champion: any,
  lastMessageSent: string | null
) {
  if (!messageText) {
    return { intent: "unknown", sentiment: "neutral", action: "wait", reasoning: "No content", generatedResponse: null }
  }

  try {
    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      prompt: `Sos Gastón, agente de inteligencia publicitaria de Seenka. Seenka es una plataforma que monitorea en tiempo real qué están comunicando las marcas en TV, digital y radio en toda Latinoamérica.

CONTEXTO:
- Estás hablando con ${champion?.name || "esta persona"} (${champion?.role || "ejecutivo"} en ${champion?.company || "su empresa"})
- Canal: LinkedIn

MENSAJE QUE VOS LE MANDASTE:
${lastMessageSent?.substring(0, 400) || "No disponible"}

SU RESPUESTA (LinkedIn):
${messageText}

ANALIZÁ Y RESPONDÉ EN JSON:
{
  "intent": "string - qué quiere/necesita (ej: quien_es_seenka, mas_info, agendar_llamada, no_interesado, no_es_momento, ya_tiene_solucion, pregunta_precio, reenviar_a_otro)",
  "sentiment": "positive | negative | neutral",
  "action": "string - qué hacer (ej: explain_seenka, send_more_info, schedule_call, close_lost, reactivate_later, wait)",
  "reasoning": "string breve",
  "generatedResponse": "string - tu respuesta como Gastón (null si action es close_lost). Máx 60 palabras. Español argentino con voseo. Sin emojis. Sin firma (LinkedIn ya la muestra)."
}

CÓMO RESPONDER:
- '¿Quiénes son?' / '¿De qué me sirve?': Explicá que Seenka monitorea qué comunican las marcas en medios (TV, digital, radio) en tiempo real. Ofrecé $500 USD en créditos con el link seenka.com/refer + generá un código único tipo G seguido de 7 caracteres alfanuméricos random (ej: G7KM2X9P).
- Muestra interés / quiere avanzar: Mandale directo los $500 USD en créditos para que explore con su equipo: link seenka.com/refer + código. Mencioná que si después quiere ver datos específicos de sus competidores, pueden agendar una charla de 15 min.
- Pide más info: Compartí valor concreto sobre lo que podemos mostrarle de sus competidores + ofrecé los créditos.
- 'No es el momento': Respondé amable, dejá la puerta abierta, no insistas.
- No interesado / muy negativo: action close_lost, generatedResponse null.
- IMPORTANTE: Siempre priorizá dar valor inmediato (créditos, datos) antes de pedir una reunión. La llamada es opcional, nunca el primer paso.

Respondé SOLO el JSON, sin markdown ni texto extra.`,
      maxTokens: 600,
    })

    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const analysis = JSON.parse(clean)
    return {
      intent: analysis.intent || "unknown",
      sentiment: analysis.sentiment || "neutral",
      action: analysis.action || "wait",
      reasoning: analysis.reasoning || "",
      generatedResponse: analysis.generatedResponse || null,
    }
  } catch (error) {
    console.error("[linkedin-webhook] LLM error:", error)
    return { intent: "error", sentiment: "neutral", action: "wait", reasoning: "LLM error", generatedResponse: null }
  }
}

// ─── Unipile payload normalizers ───────────────────────────────────────────

function normalizeSenderIdentifier(payload: any): string | null {
  // Unipile v2 format
  if (payload.message?.sender?.identifier) return payload.message.sender.identifier
  if (payload.message?.sender?.provider_id) return payload.message.sender.provider_id
  if (payload.sender?.identifier) return payload.sender.identifier
  if (payload.sender?.provider_id) return payload.sender.provider_id
  // Fallback: linkedin URL style
  if (payload.from) return payload.from
  return null
}

function normalizeSenderName(payload: any): string | null {
  if (payload.message?.sender?.name) return payload.message.sender.name
  if (payload.sender?.name) return payload.sender.name
  if (payload.from_name) return payload.from_name
  return null
}

function normalizeMessageText(payload: any): string | null {
  if (payload.message?.text) return payload.message.text
  if (payload.message?.body) return payload.message.body
  if (payload.text) return payload.text
  if (payload.body) return payload.body
  if (payload.content) return payload.content
  return null
}

function isOurOwnMessage(payload: any, ourAccountId: string): boolean {
  if (!ourAccountId) return false
  const senderId =
    payload.message?.sender?.account_id ||
    payload.message?.sender?.identifier ||
    payload.sender?.account_id ||
    ""
  return senderId === ourAccountId
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/linkedin-reply",
    description: "POST LinkedIn messages from Unipile here",
  })
}
