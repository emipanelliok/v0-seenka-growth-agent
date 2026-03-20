import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { getPrompt } from "@/lib/prompts"

export async function POST(request: NextRequest) {
  try {
    const { championId, replyContent, replySentiment } = await request.json()

    if (!championId || !replyContent) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get champion details
    const { data: champion } = await supabase
      .from("champions")
      .select("*, champion_clients(client_name)")
      .eq("id", championId)
      .single()

    if (!champion) {
      return NextResponse.json({ error: "Champion not found" }, { status: 404 })
    }

    // Get last message sent to this champion
    const { data: lastOutreachList } = await supabase
      .from("outreach_queue")
      .select("message, subject_line")
      .eq("champion_id", championId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)

    const lastOutreach = lastOutreachList?.[0]

    // Get last interaction message
    const { data: lastInteractionList } = await supabase
      .from("interactions")
      .select("message")
      .eq("champion_id", championId)
      .order("created_at", { ascending: false })
      .limit(1)

    const lastInteraction = lastInteractionList?.[0]
    const lastMessageSent = lastOutreach?.message || lastInteraction?.message || ""

    const championClients = champion?.champion_clients?.map((c: any) => c.client_name).join(", ") || "no especificados"

    // Get prompt from DB - this contains the full Gastón logic
    const basePrompt = await getPrompt("generate-reply-suggestion")
    console.log("[v0] Base prompt loaded:", basePrompt?.substring(0, 100))
    
    // Build the prompt with context variables replaced
    const promptWithContext = (basePrompt || `Sos Gastón analizando una respuesta. Evaluá temperatura y próxima acción.`)
      .replace('{champion_name}', champion.name || "Desconocido")
      .replace('{champion_company}', champion.company || "No especificada")
      .replace('{champion_title}', champion.title || "No especificado")
      .replace('{client_names}', championClients)
      .replace('{last_message}', lastMessageSent?.substring(0, 500) || "No disponible")
      .replace('{reply_content}', replyContent)

    console.log("[v0] Prompt with context built, length:", promptWithContext.length)

    // Generate response with AI
    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: promptWithContext,
      maxTokens: 1000
    })

    console.log("[v0] AI response received, length:", text.length)
    console.log("[v0] AI response preview:", text.substring(0, 200))

    // Parse JSON response
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    console.log("[v0] Cleaned text:", cleanedText.substring(0, 200))

    let analysis: Record<string, any> = {}
    try {
      analysis = JSON.parse(cleanedText)
    } catch {
      // Try extracting JSON object from surrounding text
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0])
        } catch {
          console.error("[v0] Could not parse JSON from AI response, using fallback")
        }
      }
    }
    console.log("[v0] Parsed analysis:", analysis)

    return NextResponse.json({
      intent: analysis.intent || "unknown",
      sentiment: analysis.sentiment || "neutral",
      action: analysis.accion || analysis.action || "wait",
      reasoning: analysis.razonamiento || analysis.reasoning || "",
      generatedResponse: analysis.generatedResponse || analysis.mensaje || null,
      suggestedSubject: analysis.suggestedSubject || null,
      temperatura: analysis.temperatura || null
    })

  } catch (error) {
    console.error("[v0] Error generating reply suggestion:", error)
    if (error instanceof SyntaxError) {
      console.error("[v0] JSON Parse error - invalid response from AI")
    }
    return NextResponse.json({ 
      error: "Failed to generate suggestion",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
