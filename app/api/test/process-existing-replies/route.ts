import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    )

    // Get existing replied champions
    const { data: replies } = await supabase
      .from("interactions")
      .select("id, champion_id, reply_content, reply_sentiment")
      .not("reply_content", "is", null)
      .eq("outcome", "responded")
      .order("created_at", { ascending: false })
      .limit(10)

    console.log("[v0] Found", replies?.length, "existing replies to process")

    const results = []

    for (const reply of replies || []) {
      const { data: champion } = await supabase
        .from("champions")
        .select("*, champion_clients(client_name)")
        .eq("id", reply.champion_id)
        .single()

      // Get last message sent
      const { data: lastOutreachList } = await supabase
        .from("outreach_queue")
        .select("message, subject_line")
        .eq("champion_id", reply.champion_id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
      
      const lastOutreach = lastOutreachList?.[0] || null

      // Check if draft already exists for this reply
      const { data: existingDraftList } = await supabase
        .from("outreach_queue")
        .select("id")
        .eq("champion_id", reply.champion_id)
        .eq("status", "pending_review")
        .limit(1)
      
      const existingDraft = existingDraftList?.[0] || null

      if (existingDraft) {
        console.log("[v0] Draft already exists for", champion?.name)
        results.push({
          champion: champion?.name,
          status: "skipped",
          reason: "draft_already_exists"
        })
        continue
      }

      // Agentic LLM: Analyze and generate response
      const analysis = await analyzeAndGenerateResponse(
        reply.reply_content,
        champion,
        lastOutreach?.message
      )

      console.log("[v0] Analysis for", champion?.name, ":", analysis)

      // Create draft if response was generated
      if (analysis.generatedResponse && analysis.action !== "close_lost") {
        const { error: queueError } = await supabase
          .from("outreach_queue")
          .insert({
            champion_id: reply.champion_id,
            channel: "email",
            message: analysis.generatedResponse,
            subject_line: analysis.suggestedSubject || `Re: Seguimiento`,
            status: "pending_review",
            priority: analysis.action === "schedule_call" ? 1 : 2,
            metadata: {
              auto_generated: true,
              intent_detected: analysis.intent,
              action_type: analysis.action,
              sentiment: analysis.sentiment,
              reasoning: analysis.reasoning
            }
          })

        if (queueError) {
          results.push({
            champion: champion?.name,
            status: "error",
            error: queueError.message
          })
        } else {
          results.push({
            champion: champion?.name,
            status: "draft_created",
            intent: analysis.intent,
            action: analysis.action
          })
        }
      } else {
        results.push({
          champion: champion?.name,
          status: "no_response_needed",
          action: analysis.action
        })
      }
    }

    return NextResponse.json({
      status: "success",
      processed: replies?.length || 0,
      results
    })
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

async function analyzeAndGenerateResponse(
  replyContent: string | null,
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
      reasoning: "No content",
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
${replyContent}

ANALIZA LA RESPUESTA Y RESPONDE EN JSON:
{
  "intent": "string - qué quiere/necesita (ej: mas_info, quien_es_seenka, agendar_llamada, no_interesado, no_es_momento, pregunta_precio, reenviar_a_otro)",
  "sentiment": "positive | negative | neutral",
  "action": "string - qué acción tomar (ej: send_more_info, explain_seenka, schedule_call, close_lost, wait)",
  "reasoning": "string breve",
  "generatedResponse": "string - email personalizado (null si action es close_lost o wait). Máximo 150 palabras. Profesional pero cercano.",
  "suggestedSubject": "string - asunto para respuesta"
}

REGLAS:
- Si pregunta quién es Seenka: Explica brevemente + propone call
- Si muestra interés pero pregunta "y ahora qué": Propone agendar call con datos
- Si pregunta cómo pueden trabajar juntos: Agendar call para charlar
- Si no está interesado: action close_lost (no generes respuesta)
- Si es neutral pero interesado: Propone call + compartir datos

Responde SOLO el JSON, sin markdown.`,
      maxTokens: 800
    })

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
    console.error("[v0] LLM Error:", error)
    return {
      intent: "error",
      sentiment: "neutral",
      action: "wait",
      reasoning: "Error analyzing",
      generatedResponse: null,
      suggestedSubject: null
    }
  }
}
