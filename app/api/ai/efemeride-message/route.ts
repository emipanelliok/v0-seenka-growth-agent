import { generateText } from "ai"
import { NextResponse } from "next/server"
import { getPrompt } from "@/lib/prompts"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const {
      efemeride,
      champion,
      clients,
      seenka_data,
    } = body

    // Validar champion
    if (!champion?.name) {
      return NextResponse.json(
        { error: "Falta el champion" },
        { status: 400 }
      )
    }

    // PRIORIDAD DE DATA:
    // 1. seenka_data que viene en el request (ya tiene prioridad manual_data desde el componente)
    // 2. Si no hay nada, mensaje genérico
    const dataToUse = seenka_data || "No hay datos específicos. Preguntá con qué categorías trabajan."

    // Get prompt from DB
    const basePrompt = await getPrompt("efemeride-message") || DEFAULT_PROMPT

    // Build client names
    const clientNames = clients?.map((c: { name: string }) => c.name).join(", ") || ""
    
    // Replace all variables in the prompt
    const prompt = basePrompt
      .replace(/{seenka_data}/g, dataToUse)
      .replace(/{champion_name}/g, champion.name)
      .replace(/{champion_role}/g, champion.role || "")
      .replace(/{champion_company}/g, champion.company || "")
      .replace(/{champion_industry}/g, champion.industry || "")
      .replace(/{client_names}/g, clientNames)
      .replace(/{efemeride_name}/g, efemeride?.name || "evento")

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

    return NextResponse.json({ message: text.trim() })
  } catch (error) {
    console.error("Error generating efemeride message:", error)
    return NextResponse.json(
      { error: "Error al generar el mensaje" },
      { status: 500 }
    )
  }
}

const DEFAULT_PROMPT = `Sos Gastón, especialista en data e inversión publicitaria. Escribí un primer mensaje para {champion_name} de {champion_company}.

DATA DISPONIBLE:
{seenka_data}

EFEMÉRIDE: {efemeride_name}
CLIENTES/MARCAS: {client_names}

INSTRUCCIONES:
- Usá UN dato concreto del documento (no inventes)
- Preguntá algo que invite a seguir la conversación
- NO menciones Seenka, reuniones ni llamadas
- Máximo 60 palabras
- Tuteo natural, sin emojis
- Firma: — Gastón

Escribí SOLO el mensaje, nada más.`
