import { generateText } from "ai"
import { NextResponse } from "next/server"
import { getPrompt } from "@/lib/prompts"

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

interface ConversationRequest {
  champion: {
    name: string
    title?: string
    company?: string
    industry?: string
  }
  efemeride: {
    name: string
  }
  seenka_data: string
  discount_code: string
  conversation_history: ConversationMessage[]
}

interface ConversationResponse {
  message: string
  temperatura: "caliente" | "tibio" | "frio" | "negativo" | "sin_respuesta"
  accion: "continuar" | "revelar_seenka" | "ofrecer_trial" | "stand_by"
  razonamiento: string
}

export async function POST(request: Request) {
  try {
    const body: ConversationRequest = await request.json()

    const {
      champion,
      efemeride,
      seenka_data,
      discount_code,
      conversation_history = [],
    } = body

    // Get system prompt from DB
    const systemPromptTemplate = await getPrompt("conversation-agent") || `Sos Gastón, especialista en data e inversión publicitaria.`

    // Build the system prompt with context
    const systemPrompt = systemPromptTemplate
      .replace(/{champion_name}/g, champion.name || "")
      .replace(/{champion_title}/g, champion.title || "")
      .replace(/{champion_company}/g, champion.company || "")
      .replace(/{champion_industry}/g, champion.industry || "")
      .replace(/{efemeride_name}/g, efemeride.name || "")
      .replace(/{seenka_data}/g, seenka_data || "No hay datos disponibles")
      .replace(/{discount_code}/g, discount_code || "")

    // Build conversation array for the LLM
    const messages = [
      {
        role: "user" as const,
        content: systemPrompt
      },
      ...conversation_history
    ]

    // Call the LLM
    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      messages,
      temperature: 0.7,
      maxTokens: 400,
    })

    // Parse the JSON response from the LLM
    // The LLM should return a JSON object with the structure above
    let parsedResponse: ConversationResponse
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0])
      } else {
        // If no JSON found, create a response structure
        parsedResponse = {
          message: text,
          temperatura: "tibio",
          accion: "continuar",
          razonamiento: "Respuesta generada sin estructura JSON"
        }
      }
    } catch (parseError) {
      parsedResponse = {
        message: text,
        temperatura: "tibio",
        accion: "continuar",
        razonamiento: "Error parseando respuesta, usando texto directo"
      }
    }

    return NextResponse.json(parsedResponse)
  } catch (error) {
    console.error("Error in conversation endpoint:", error)
    return NextResponse.json(
      { error: "Error al procesar conversación: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
