import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"

export const maxDuration = 60

// Admin client bypasses RLS — needed because interactions are created by webhook (service role)
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth check only
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    // Use admin client for data access (bypasses RLS)
    const admin = getAdminClient()

    // Get the interaction
    const { data: interaction, error: ixError } = await admin
      .from("interactions")
      .select("id, champion_id, message, reply_content, response, outcome, channel, efemeride_id, created_at")
      .eq("id", id)
      .single()

    if (ixError || !interaction) {
      console.error("suggest-reply: interaction not found", id, ixError?.message)
      return NextResponse.json({ error: "Interacción no encontrada" }, { status: 404 })
    }

    // Get champion
    const { data: champion } = await admin
      .from("champions")
      .select("id, name, company, role, email, linkedin_url")
      .eq("id", interaction.champion_id)
      .single()

    if (!champion) {
      return NextResponse.json({ error: "Champion no encontrado" }, { status: 404 })
    }

    const replyRaw = interaction.reply_content || interaction.response || ""

    function stripReply(text: string): string {
      if (!text) return ""
      const lines = text.split("\n")
      const out: string[] = []
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (/^On .+ wrote:/i.test(t)) break
        if (/^El .+(escribi[oó]:|wrote:)/i.test(t)) break
        if (/^--\s*$/.test(t)) break
        if (/^-{3,}/.test(t) || /^_{3,}/.test(t)) break
        if (t.startsWith(">")) continue
        if (i > 0 && /^\+\d[\d\s]{6,}$/.test(t)) break
        if (/^(Agendemos|Agendamos)\s/i.test(t)) break
        out.push(lines[i])
      }
      while (out.length && out[out.length - 1].trim() === "") out.pop()
      return out.join("\n").trim()
    }

    const replyClean = stripReply(replyRaw)

    // Get conversation history
    const { data: prevInteractions } = await admin
      .from("interactions")
      .select("message, response, reply_content, outcome, created_at")
      .eq("champion_id", interaction.champion_id)
      .order("created_at", { ascending: true })

    const historyText = (prevInteractions || [])
      .map((ix) => {
        const sent = `Gastón: ${ix.message}`
        const reply = ix.reply_content || ix.response
        if (reply && ix.outcome === "responded") {
          return `${sent}\n${champion.name}: ${stripReply(reply)}`
        }
        return sent
      })
      .join("\n\n")

    const prompt = `Sos Gastón, agente de inteligencia publicitaria de Seenka.
Seenka monitorea en tiempo real qué están comunicando las marcas en TV, digital y radio en toda Latinoamérica.

CONTEXTO:
- Estás hablando con ${champion.name} (${champion.role || "ejecutivo"} en ${champion.company || "su empresa"})
- Canal: ${interaction.channel === "email" ? "email" : "LinkedIn"}

HISTORIAL:
${historyText}

RESPUESTA QUE RECIBISTE:
${replyClean}

INSTRUCCIONES:
- Respondé natural y breve (máx 80 palabras)
- Si pregunta "quiénes son" o "de qué sirve": explicá que Seenka monitorea qué comunican las marcas en medios en tiempo real. Ofrecé $500 USD en créditos para que lo explore con su equipo.
- Si muestra interés: proponé charla de 15 min para mostrarle datos de su industria
- Si es negativo o escéptico: respondé con curiosidad, no te pongas defensivo
- Español argentino con voseo, sin emojis
- Firmá como "Gastón\\nSeenka Media Intelligence"
- Solo el mensaje, nada más`

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt,
      temperature: 0.7,
      maxTokens: 300,
    })

    const message = text.trim()

    // Save to outreach_queue
    const { data: queueItem, error: insertError } = await admin
      .from("outreach_queue")
      .insert({
        champion_id: interaction.champion_id,
        efemeride_id: interaction.efemeride_id || null,
        message,
        subject_line: null,
        channel: interaction.channel,
        status: "pending_review",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, queueItem })
  } catch (err: unknown) {
    console.error("suggest-reply error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}
