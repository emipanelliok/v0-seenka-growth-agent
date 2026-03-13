import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const TriggerEvaluationSchema = z.object({
  is_worth_contacting: z.boolean().describe("Si este trigger justifica contactar al champion"),
  severity: z.enum(["high", "medium", "low"]).describe("Nivel de urgencia del trigger"),
  topic: z.string().describe("Tema principal identificado en el trigger"),
  reasoning: z.string().describe("Explicación breve de por qué vale o no la pena contactar"),
  recommended_products: z.array(z.enum(["content_insight", "ad_insight", "creative_sense", "adsales_radar"]))
    .describe("Productos de Seenka recomendados para este contacto"),
  product_reasoning: z.string().describe("Por qué se recomiendan estos productos específicos"),
  mentioned_people: z.array(z.object({
    name: z.string(),
    role: z.string().nullable(),
    company: z.string().nullable(),
  })).describe("Personas mencionadas que podrían ser contactos relevantes adicionales"),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autorizado" }, { status: 401 })
    }

    const { source_text, champion_name, champion_company, champion_industry } = await req.json()

    if (!source_text) {
      return Response.json({ error: "Se requiere source_text" }, { status: 400 })
    }

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema: TriggerEvaluationSchema }),
      prompt: `Eres un asistente de ventas B2B experto de Seenka, una empresa de media intelligence y social listening.

PRODUCTOS DE SEENKA:
1. **Content Insight**: Monitoreo de noticias y redes sociales para potenciar campañas y estrategias. Ideal para: entender percepción de marca, monitorear competencia en medios, obtener insights de audiencia.

2. **Ad Insight**: Monitoreo de publicidad cross-media de marcas y competencia. Ideal para: analizar inversión publicitaria, benchmark de competencia, optimizar mix de medios.

3. **Creative Sense**: Biblioteca de publicidades con IA para inspirar ideas creativas. Ideal para: inspiración creativa, analizar tendencias publicitarias, referencias de campañas.

4. **AdSales Radar**: Inteligencia comercial para identificar quién invierte, dónde y cuánto. Ideal para: equipos comerciales de medios, identificar anunciantes potenciales, acelerar prospección.

CHAMPION A EVALUAR:
- Nombre: ${champion_name || "No especificado"}
- Empresa: ${champion_company || "No especificada"}
- Industria: ${champion_industry || "No especificada"}

CONTENIDO A ANALIZAR:
${source_text}

TAREAS:
1. Evalúa si vale la pena contactar a este champion basándote en el contenido
2. Identifica qué productos de Seenka serían relevantes para su situación
3. Explica por qué esos productos específicos le servirían
4. Si hay personas mencionadas en el contenido que podrían ser contactos adicionales, inclúyelas

CRITERIOS PARA EVALUAR:
- ¿El contenido indica necesidad de insights de medios o competencia?
- ¿Están lanzando campañas, productos o expandiéndose?
- ¿Mencionan desafíos con medición, creatividad o prospección?
- ¿Es un buen momento para ofrecer una solución de media intelligence?`,
    })

    return Response.json(result.output)
  } catch (error) {
    console.error("Error evaluating trigger:", error)
    return Response.json(
      { error: "Error al evaluar el trigger" },
      { status: 500 }
    )
  }
}
