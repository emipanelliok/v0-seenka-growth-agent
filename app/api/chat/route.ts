import { streamText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { buildGastonTools } from "@/lib/gaston-chat-tools"
import { buildPlaybook } from "@/lib/gaston-playbook"

export const maxDuration = 60

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response("No autenticado", { status: 401 })
    }

    const { messages, conversationId } = await request.json()

    const admin = adminClient()

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const firstUserMsg = messages.find((m: any) => m.role === "user")?.content || ""
      const title = firstUserMsg.substring(0, 60) || "Nueva conversación"

      const { data: conv } = await admin
        .from("chat_conversations")
        .insert({ user_id: user.id, title })
        .select("id")
        .single()

      convId = conv?.id
    }

    // Save user message
    const lastUserMsg = messages[messages.length - 1]
    if (lastUserMsg?.role === "user" && convId) {
      await admin.from("chat_messages").insert({
        conversation_id: convId,
        role: "user",
        content: lastUserMsg.content,
      })
    }

    // Build context
    const playbook = await buildPlaybook(admin)

    // Get learnings for this user
    const { data: learnings } = await admin
      .from("gaston_learnings")
      .select("category, content, confidence")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("confidence", { ascending: false })
      .limit(20)

    let learningsContext = ""
    if (learnings && learnings.length > 0) {
      learningsContext = "\n\nAPRENDIZAJES PREVIOS DEL USUARIO:\n"
      learnings.forEach((l: any) => {
        learningsContext += `- [${l.category}] ${l.content} (confianza: ${Math.round(l.confidence * 100)}%)\n`
      })
    }

    // Build tools
    const tools = buildGastonTools(user.id)

    const systemPrompt = `Sos Gastón, el copiloto de inteligencia publicitaria de Seenka Growth Agent. Seenka monitorea en tiempo real qué comunican las marcas en TV, digital y radio en Latinoamérica.

QUIÉN SOS:
- Agente de ventas inteligente que ayuda a gestionar el pipeline de prospectos (champions)
- Podés consultar datos, crear champions, generar mensajes, enviar outreach, analizar performance
- Hablás en español argentino con voseo
- Sos directo, profesional pero cercano
- Sin emojis innecesarios

QUÉ PODÉS HACER:
- Consultar y gestionar champions (prospectos B2B)
- Ver y crear efemérides (eventos de marketing como Hot Sale, Black Friday)
- Generar mensajes personalizados para outreach
- Encolar mensajes para revisión antes de enviar
- Ver estadísticas del pipeline y rendimiento de mensajes
- Analizar historial de interacciones

CÓMO RESPONDÉS:
- Si te piden datos, usá las herramientas disponibles — no inventes
- Si creás algo (champion, efeméride, mensaje), confirmá qué hiciste
- Si no tenés suficiente info, preguntá
- Cuando muestres listas, formateá en markdown para que sea legible
- Sé conciso pero completo
${playbook}${learningsContext}

IMPORTANTE: Siempre priorizá dar valor inmediato. Los créditos de $500 USD (seenka.com/refer) son tu mejor herramienta de apertura.`

    const result = streamText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 5,
      onFinish: async ({ text, toolCalls }) => {
        // Persist assistant message
        if (convId && text) {
          await admin.from("chat_messages").insert({
            conversation_id: convId,
            role: "assistant",
            content: text,
            tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
          })
        }

        // Update conversation timestamp
        if (convId) {
          await admin.from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId)
        }
      },
    })

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": convId || "",
      },
    })

  } catch (error) {
    console.error("[chat] Error:", error)
    return new Response(String(error), { status: 500 })
  }
}
