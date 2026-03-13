import { generateText } from "ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const data = await request.json()
  const {
    name, role, headline, company, industry, country,
    summary, skills, experiences, company_data, champion_type,
  } = data

  const skillsList = skills?.slice(0, 15)?.join(", ") || "No disponible"
  
  const experiencesList = experiences?.slice(0, 3)?.map((e: any) => {
    return `- ${e.title || "Sin cargo"} en ${e.company || "Sin empresa"} (${e.starts_at || "?"} - ${e.ends_at || "Actual"})`
  }).join("\n") || "No disponible"

  const companyInfo = company_data?.found
    ? `
Industria: ${company_data.industry || "Desconocida"} ${company_data.sub_industry ? `/ ${company_data.sub_industry}` : ""}
Tamaño: ${company_data.size || "Desconocido"} ${company_data.employee_count ? `(${company_data.employee_count.toLocaleString()} empleados)` : ""}
Fundada: ${company_data.founded || "Desconocido"}
Tipo: ${company_data.type || "Desconocido"}
Tags: ${company_data.tags?.slice(0, 8)?.join(", ") || "Sin tags"}
Descripción: ${company_data.description || "Sin descripción"}
`
    : "No hay datos detallados de la empresa"

  const { text } = await generateText({
    model: "openai/gpt-4o-mini",
    prompt: `Sos un asistente que sintetiza datos profesionales de una persona en un resumen ejecutivo factual. NO inventés datos, NO hagas recomendaciones de venta, NO saques conclusiones sobre qué venderle ni cómo abordarlo. Solo resumí lo que sabemos.

DATOS DISPONIBLES:
- Nombre: ${name || "Desconocido"}
- Cargo actual: ${role || "Desconocido"}
- Headline LinkedIn: ${headline || "No disponible"}
- Empresa actual: ${company || "Desconocida"}
- País: ${country || "Desconocido"}
- Clasificación: ${champion_type || "otro"}
- Bio/Resumen LinkedIn: ${summary || "No disponible"}
- Skills: ${skillsList}

EXPERIENCIA LABORAL:
${experiencesList}

DATOS DE LA EMPRESA:
${companyInfo}

INSTRUCCIONES:
- Escribí un resumen factual de 3-5 oraciones en español argentino
- Describí quién es: cargo, empresa, industria, trayectoria relevante
- Mencioná datos concretos: skills, clientes que maneja, tamaño de empresa, industria
- Si hay datos de experiencia previa relevantes, mencioná los cargos anteriores
- Si maneja clientes/marcas, listalos
- NO recomiendes cómo venderle, NO menciones Creative Sense ni Seenka, NO hagas suposiciones sobre qué le interesaría
- Solo usá información que esté en los datos de arriba, no inventés nada
- Texto corrido en un párrafo, sin bullets, sin títulos, máximo 5 oraciones`,
  })

  return NextResponse.json({ profile_summary: text })
}
