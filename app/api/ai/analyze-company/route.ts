import { generateObject } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getNomenclatorText } from "@/lib/seenka-nomenclator"

const CompanyAnalysisSchema = z.object({
  industry: z.string().describe("Industry del nomenclador de Seenka que mejor corresponde"),
  sector: z.string().describe("Sector del nomenclador de Seenka que mejor corresponde"),
  size: z.enum(["Startup", "PyME", "Mediana", "Grande", "Enterprise"]).describe("Tamaño estimado de la empresa"),
  pain_points: z.array(z.string()).describe("Posibles pain points o desafíos de esta empresa que Creative Sense de Seenka puede resolver"),
  sales_angle: z.string().describe("Ángulo de venta sugerido enfocado en Creative Sense de Seenka"),
  description: z.string().describe("Breve descripción de qué hace la empresa"),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { company_name, champion_role, champion_headline } = body

    if (!company_name) {
      return Response.json({ error: "Se requiere nombre de empresa" }, { status: 400 })
    }

    // Normalizar nombre para buscar en DB
    const normalizedName = company_name.toLowerCase().trim().replace(/\s+/g, " ")

    // Verificar si ya existe en la base de datos
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("*")
      .eq("normalized_name", normalizedName)

    if (existingCompanies && existingCompanies.length > 0) {
      return Response.json({ 
        company: existingCompanies[0], 
        source: "database",
        message: "Empresa encontrada en base de datos" 
      })
    }

    // No existe, analizar con GPT
    const nomenclatorText = getNomenclatorText()

    const { object: analysis } = await generateObject({
      model: "openai/gpt-4o-mini",
      schema: CompanyAnalysisSchema,
      prompt: `Sos un experto en clasificación de empresas para Seenka, una empresa de media intelligence de Argentina.

${nomenclatorText}

PRODUCTO DE SEENKA QUE ESTAMOS VENDIENDO:
Creative Sense: Biblioteca de publicidades con IA que permite buscar, analizar y comparar campañas publicitarias. Ideal para equipos creativos, agencias y marcas que necesitan inspiración, benchmark competitivo y análisis de tendencias creativas en TV, digital y otros medios.

EMPRESA A CLASIFICAR:
- Nombre: ${company_name}
${champion_role ? `- Rol del contacto: ${champion_role}` : ""}
${champion_headline ? `- Headline del contacto: ${champion_headline}` : ""}

INSTRUCCIONES:
1. Elegí la Industry y Sector del nomenclador que MEJOR correspondan a esta empresa
2. Si no estás seguro, elegí la categoría más cercana
3. Estimá el tamaño basándote en lo que sabés de la empresa
4. Identificá pain points donde Creative Sense de Seenka puede aportar valor (benchmark creativo, inspiración, análisis de competencia publicitaria)
5. Sugerí un ángulo de venta enfocado en Creative Sense

IMPORTANTE:
- Industry y Sector DEBEN ser del nomenclador exactamente como están escritos
- Si la empresa es una agencia de publicidad, clasificala en la industria más cercana pero mencioná que es agencia en la descripción
- Si no conocés la empresa, hacé tu mejor estimación basándote en el nombre y contexto

Respondé en español.`,
    })

    // Guardar en base de datos
    const { data: newCompany, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: company_name,
        normalized_name: normalizedName,
        industry: analysis.industry,
        sector: analysis.sector,
        size: analysis.size,
        description: analysis.description,
        pain_points: analysis.pain_points,
        sales_angle: analysis.sales_angle,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting company:", insertError)
      // Si es error de duplicado, buscar la existente
      if (insertError.code === "23505") {
        const { data: existingList } = await supabase
          .from("companies")
          .select("*")
          .eq("normalized_name", normalizedName)
        
        if (existingList && existingList.length > 0) {
          return Response.json({ 
            company: existingList[0], 
            source: "database",
            message: "Empresa ya existía" 
          })
        }
      }
      return Response.json({ error: "Error al guardar empresa" }, { status: 500 })
    }

    return Response.json({ 
      company: newCompany, 
      source: "ai_analysis",
      message: "Empresa analizada y guardada" 
    })

  } catch (error) {
    console.error("Error analyzing company:", error)
    return Response.json({ 
      error: error instanceof Error ? error.message : "Error desconocido" 
    }, { status: 500 })
  }
}
