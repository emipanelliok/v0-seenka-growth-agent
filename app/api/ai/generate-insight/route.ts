import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const InsightSchema = z.object({
  insight: z.string().describe("Un insight personalizado sobre por qué es buen momento para contactar"),
  suggested_message: z.string().describe("Mensaje sugerido para LinkedIn o email, personalizado y natural"),
  talking_points: z.array(z.string()).describe("Lista de 3-5 puntos clave para mencionar en la conversación"),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autorizado" }, { status: 401 })
    }

    const {
      trigger_text,
      trigger_topic,
      champion_name,
      champion_role,
      champion_company,
      champion_industry,
      champion_sector,
      seenka_ai_insight,
      company_pain_points,
      company_sales_angle,
      company_seenka_products,
      channel,
    } = await req.json()

    if (!trigger_text || !champion_name) {
      return Response.json({ error: "Faltan datos requeridos" }, { status: 400 })
    }

    // Load custom AI instructions from settings
    const { data: settingsData } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "ai_message_instructions")

    const customInstructions = settingsData?.[0]?.value || ""

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema: InsightSchema }),
      prompt: `Sos una persona que trabaja en inteligencia publicitaria y le vas a escribir a alguien de la industria. No sos un vendedor. Simplemente viste algo relevante para su trabajo y se lo compartís.

Seenka es una plataforma de monitoreo publicitario. No la describas ni la presentes. El foco es el dato, no el producto.

DATOS DEL CONTACTO:
- Nombre: ${champion_name}
- Rol: ${champion_role || ""}
- Empresa: ${champion_company || ""}
- Industria: ${champion_industry || ""}
- Sector: ${champion_sector || ""}

INFORMACIÓN QUE TENÉS (el dato que dispara el contacto):
${trigger_text}

${seenka_ai_insight ? `DATO ADICIONAL DE LA INDUSTRIA:\n${seenka_ai_insight}` : ""}

${company_pain_points?.length ? `CONTEXTO DE SU NEGOCIO:\n${company_pain_points.map((p: string) => `- ${p}`).join("\n")}` : ""}

TONO Y ESTILO — esto es lo más importante:
- El mensaje tiene que parecer que viste algo y se lo mandás, sin agenda de ventas
- Mencioná el dato específico directo, sin rodeos: números, marcas, tendencias tal cual
- No expliques qué es Seenka ni qué hace tu herramienta
- No digas "me gustaría contarte sobre...", "querías saber si...", "tenemos una solución para..."
- Cerrá con una sola pregunta corta y genuina sobre su realidad, no sobre tu producto
- No arranques con el nombre de la persona

CANAL: ${channel === "linkedin" 
  ? "LinkedIn — máximo 300 caracteres, directo y sin vuelta" 
  : `Email — Seguí este esquema EXACTO, respetando los saltos de línea:

Asunto: [Incluí el nombre de una marca o dato concreto. Máximo 8 palabras.]

Hola [Nombre],

¿Cómo estás?

[Párrafo 1: arrancá con el dato concreto que tenés.]

[Párrafo 2: contexto de la tendencia, máximo 2 oraciones.]

[CTA: una sola pregunta natural.]

[firma corta solo tu nombre]

REGLAS: respetá los saltos de línea entre párrafos, no uses bullets ni asteriscos ni markdown.`}

REGLAS DURAS:
- Español argentino con voseo pero NUNCA uses "Che" ni "che" para arrancar o en medio del mensaje
- Sin emojis
- Sin saludos formales ni firmas elaboradas
- Los datos del trigger son el gancho, usalos textuales si tenés números (los tiempos de aire están en segundos, convertí a minutos u horas si son grandes)
- No inventés datos
- Solo el mensaje (y el asunto si es email), nada más

${customInstructions ? `INSTRUCCIONES ADICIONALES:\n${customInstructions}` : ""}`,
    })

    return Response.json(result.output)
  } catch (error) {
    console.error("Error generating insight:", error)
    return Response.json(
      { error: "Error al generar el insight" },
      { status: 500 }
    )
  }
}
