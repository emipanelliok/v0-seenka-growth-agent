import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const ProspectAnalysisSchema = z.object({
  score: z.enum(["high", "medium", "low"]).describe("Potencial como champion de Seenka"),
  reason: z.string().describe("Explicación breve de por qué tiene ese score"),
  recommended_products: z.array(z.string()).describe("Productos de Seenka que le servirían"),
  pain_points: z.array(z.string()).describe("Posibles pain points que Seenka puede resolver"),
  talking_points: z.array(z.string()).describe("Temas para iniciar conversación"),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await request.json()
    const { name, role, company, industry, headline, summary, linkedin_url } = body

    if (!name && !linkedin_url) {
      return Response.json({ error: "Se requiere nombre o URL de LinkedIn" }, { status: 400 })
    }

    // Load custom criteria from settings if user is authenticated
    let customCriteria = ""
    if (user) {
      const { data: settings } = await supabase
        .from("settings")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "ai_champion_criteria")
        .maybeSingle()
      
      customCriteria = settings?.value || ""
    }

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema: ProspectAnalysisSchema }),
      prompt: `Sos un analista de ventas de Seenka, una empresa de media intelligence de Argentina.

CONTEXTO DE SEENKA:
Seenka ofrece 4 productos:
1. Ad Intelligence - Monitoreo de publicidad de competidores, inversión publicitaria estimada
2. Social Listening - Monitoreo de redes sociales, sentiment analysis, trending topics
3. PR Monitoring - Monitoreo de medios tradicionales, clipping, análisis de cobertura
4. Content Analytics - Análisis de performance de contenido propio

PERFIL A ANALIZAR:
- Nombre: ${name || "No disponible"}
- Rol: ${role || "No disponible"}
- Empresa: ${company || "No disponible"}
- Industria: ${industry || "No disponible"}
- Headline: ${headline || "No disponible"}
- Resumen: ${summary || "No disponible"}

CRITERIOS DE EVALUACIÓN:

ALTO POTENCIAL (score: high):
- Trabaja en marketing, publicidad, comunicación, PR, medios, research
- Tiene rol de decisión: Director, Head, VP, CMO, CEO, Gerente, Manager
- Empresa de industria relevante: consumo masivo, retail, finanzas, telco, medios, agencias
- Empresa mediana o grande (probablemente tenga presupuesto)

POTENCIAL MEDIO (score: medium):
- Trabaja en área relacionada pero no es decisor
- Industria relevante pero empresa chica
- Rol junior pero en empresa grande
- Podría ser influencer interno o referidor

BAJO POTENCIAL (score: low):
- Industria no relevante (tech puro, construcción, salud, etc.)
- Rol sin relación con marketing/comunicación
- Freelancer o consultor individual
- Estudiante o en transición

IMPORTANTE:
- Sé directo y honesto en la evaluación
- No infles el score para quedar bien
- Explicá claramente por qué

${customCriteria ? `CRITERIOS PERSONALIZADOS DEL USUARIO:\n${customCriteria}` : ""}

Respondé en español.`,
    })

    return Response.json(result.object)
  } catch (error) {
    console.error("Error analyzing prospect:", error)
    return Response.json({ error: "Error al analizar prospecto" }, { status: 500 })
  }
}
