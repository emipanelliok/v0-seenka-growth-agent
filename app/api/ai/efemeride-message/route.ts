import { generateText } from "ai"
import { NextResponse } from "next/server"
import { getPrompt } from "@/lib/prompts"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    console.log("[v0] ============ EFEMERIDE MESSAGE ENDPOINT ============")
    console.log("[v0] Request body keys:", Object.keys(body))
    console.log("[v0] seenka_data received:", body.seenka_data?.substring(0, 200))
    console.log("[v0] manual_data received:", body.manual_data?.substring(0, 200))
    console.log("[v0] efemeride.manual_data:", body.efemeride?.manual_data?.substring(0, 200))
    
    const {
      efemeride,
      champion,
      clients,
      stage,
      manual_data,
      seenka_data,
    } = body

    // PRIORIDAD: manual_data (documento cargado) > seenka_data
    const dataToUse = manual_data || seenka_data || null
    
    console.log("[v0] dataToUse:", dataToUse?.substring(0, 300))

    // Get prompt from DB
    const basePrompt = await getPrompt("efemeride-message") || `Sos Gastón. Escribí un mensaje corto sobre la efeméride usando los datos disponibles.`

    // Build client names
    const clientNames = clients?.map((c: any) => c.name).join(", ") || "no especificado"
    
    // Replace all variables in the prompt
    const prompt = basePrompt
      .replace(/{seenka_data}/g, dataToUse || "No hay datos del documento. Preguntá qué categorías manejan.")
      .replace(/{champion_name}/g, champion?.name || "")
      .replace(/{champion_title}/g, champion?.title || "")
      .replace(/{champion_company}/g, champion?.company || "")
      .replace(/{client_names}/g, clientNames)
      .replace(/{efemeride_name}/g, efemeride?.name || "")
      .replace(/{stage}/g, stage || "cold")

    console.log("[v0] Final prompt (first 500 chars):", prompt.substring(0, 500))

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      system: `Sos Gastón, el agente de ventas de Seenka. Escribís mensajes de outreach cortos y directos.

REGLAS ESTRICTAS:
- Máximo 60 palabras totales
- Solo usá los números y datos que aparecen explícitamente en el documento o datos de Seenka que te pasan. NUNCA inventes cifras, porcentajes ni estadísticas.
- Si no hay datos concretos, hacé una pregunta inteligente sobre el tema sin inventar nada
- Tono casual y directo, sin frases de vendedor`,
      prompt,
      temperature: 0.8,
      maxTokens: 200,
    })

    console.log("[v0] Generated message:", text.substring(0, 300))
    console.log("[v0] ============ END ENDPOINT ============")

    return NextResponse.json({ message: text.trim() })
  } catch (error) {
    console.error("Error generating efemeride message:", error)
    return NextResponse.json(
      { error: "Error al generar el mensaje" },
      { status: 500 }
    )
  }
}
