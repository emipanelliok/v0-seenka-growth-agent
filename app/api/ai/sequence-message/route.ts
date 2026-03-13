import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const SequenceMessageSchema = z.object({
  message: z.string().describe("El mensaje generado para enviar por LinkedIn"),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autorizado" }, { status: 401 })
    }

    const {
      champion_name,
      champion_role,
      champion_company,
      champion_industry,
      champion_sector,
      seenka_ai_insight,
      company_pain_points,
      company_sales_angle,
      previous_messages,
      response_text,
      response_type,
      step_strategy,
      step_tone,
      step_number,
      path,
    } = await req.json()

    if (!champion_name || !step_strategy) {
      return Response.json({ error: "Faltan datos requeridos" }, { status: 400 })
    }

    // Load custom AI instructions
    const { data: settingsData } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "ai_message_instructions")

    const customInstructions = settingsData?.[0]?.value || ""

    const previousMessagesText = previous_messages?.length
      ? previous_messages.map((m: { step: number; path: string; text: string; response?: string }) => 
          `Mensaje ${m.step} (${m.path}): "${m.text}"${m.response ? `\nRespuesta del contacto: "${m.response}"` : ""}`
        ).join("\n\n")
      : "Ninguno"

    const pathLabels: Record<string, string> = {
      no_response: "El contacto NO respondió al mensaje anterior",
      positive: "El contacto respondió POSITIVAMENTE",
      lukewarm: "El contacto respondió de forma TIBIA (no dijo que no, pero tampoco mostró mucho interés)",
      negative: "El contacto respondió NEGATIVAMENTE o dijo que no le interesa",
    }

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema: SequenceMessageSchema }),
      prompt: `Sos una persona que trabaja en inteligencia publicitaria y le estás haciendo seguimiento a alguien de la industria. No sos un vendedor, no estás vendiendo nada. Seguís la conversación de forma natural.

Seenka es una plataforma de monitoreo publicitario. No la describas, no la presentes. Si el contexto da pie a mencionarla, hacelo de pasada.

SITUACIÓN ACTUAL:
${pathLabels[path] || "Follow-up"}
Este es el mensaje número ${step_number} de la secuencia.

DATOS DEL CONTACTO:
- Nombre: ${champion_name}
- Rol: ${champion_role || ""}
- Empresa: ${champion_company || ""}
- Industria: ${champion_industry || ""}
- Sector: ${champion_sector || ""}

${seenka_ai_insight ? `DATO DE LA INDUSTRIA (usalo si encaja naturalmente):\n${seenka_ai_insight}` : ""}

${company_pain_points?.length ? `CONTEXTO DE SU NEGOCIO:\n${company_pain_points.map((p: string) => `- ${p}`).join("\n")}` : ""}

${company_sales_angle ? `ÁNGULO:\n${company_sales_angle}` : ""}

HISTORIAL DE LO QUE YA SE HABLÓ:
${previousMessagesText}

${response_text ? `LO QUE RESPONDIÓ:\n"${response_text}"` : ""}

ESTRATEGIA PARA ESTE MENSAJE:
${step_strategy}

TONO Y ESTILO — esto es lo más importante:
- Escribí como alguien que retoma una conversación de industria, no como un vendedor haciendo seguimiento
- No arranques con el nombre de la persona
- No digas "vi que no respondiste", "te escribí antes", "quería saber si tuviste tiempo"
- Si respondió positivamente: avanzá con naturalidad, proponé algo concreto sin exagerar el entusiasmo
- Si respondió tibiamente: tirá un dato nuevo o una pregunta diferente, no insistas con lo mismo
- Si respondió negativamente: cerrá con elegancia, dejá la puerta abierta sin rogar
- Si no respondió: cambiá el ángulo completamente, como si fuera un primer mensaje sobre otro dato
- Nunca uses frases de vendedor: "quisiera saber si...", "me gustaría ofrecerte...", "estarías disponible para..."
- Una sola pregunta al final, corta y natural

REGLAS DURAS:
- Máximo 300 caracteres
- Español argentino con voseo pero NUNCA uses "Che" ni "che" para arrancar o en medio del mensaje
- Sin emojis
- Sin saludos formales
- No inventés datos si no los tenés
- Solo el mensaje, nada más

${customInstructions ? `INSTRUCCIONES ADICIONALES:\n${customInstructions}` : ""}`,
    })

    return Response.json(result.output)
  } catch (error) {
    console.error("Error generating sequence message:", error)
    return Response.json(
      { error: "Error al generar el mensaje" },
      { status: 500 }
    )
  }
}
