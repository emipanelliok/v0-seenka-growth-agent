// Builds Gastón's playbook from real interaction history.
// Queries past interactions where champions replied, and formats
// them as learning context for the LLM prompt.

interface PlaybookEntry {
  champion_reply: string
  gaston_message: string
  sentiment: string
  outcome: string
  channel: string
  champion_company: string | null
}

export async function buildPlaybook(supabase: any): Promise<string> {
  // Get interactions that have replies (real conversations)
  const { data: interactions } = await supabase
    .from("interactions")
    .select("message, reply_content, reply_sentiment, outcome, channel, champion_id")
    .not("reply_content", "is", null)
    .order("created_at", { ascending: false })
    .limit(30)

  if (!interactions || interactions.length === 0) return ""

  // Get champion companies for context
  const champIds = [...new Set(interactions.map((i: any) => i.champion_id))]
  const { data: champions } = await supabase
    .from("champions")
    .select("id, company")
    .in("id", champIds)

  const companyMap = new Map((champions || []).map((c: any) => [c.id, c.company]))

  // Build entries
  const entries: PlaybookEntry[] = interactions.map((i: any) => ({
    champion_reply: (i.reply_content || "").substring(0, 120),
    gaston_message: (i.message || "").substring(0, 120),
    sentiment: i.reply_sentiment || "unknown",
    outcome: i.outcome || "unknown",
    channel: i.channel || "email",
    champion_company: companyMap.get(i.champion_id) || null,
  }))

  // Group by sentiment to extract patterns
  const positive = entries.filter(e => e.sentiment === "positive")
  const negative = entries.filter(e => e.sentiment === "negative")
  const neutral = entries.filter(e => e.sentiment === "neutral")

  let playbook = `\nAPRENDIZAJES DE CONVERSACIONES ANTERIORES (${entries.length} respuestas procesadas):\n`

  if (positive.length > 0) {
    playbook += `\n✓ ${positive.length} respuestas positivas. Ejemplos de qué funcionó:\n`
    positive.slice(0, 5).forEach(e => {
      playbook += `  - Dijeron: "${e.champion_reply}..." → Respondimos con éxito\n`
    })
  }

  if (negative.length > 0) {
    playbook += `\n✗ ${negative.length} respuestas negativas. Evitar estos patrones:\n`
    negative.slice(0, 3).forEach(e => {
      playbook += `  - Dijeron: "${e.champion_reply}..." → No funcionó\n`
    })
  }

  if (neutral.length > 0) {
    playbook += `\n~ ${neutral.length} respuestas neutrales (preguntas, pedidos de info):\n`
    neutral.slice(0, 5).forEach(e => {
      playbook += `  - "${e.champion_reply}..."\n`
    })
  }

  // Overall stats
  const responded = entries.filter(e => e.outcome === "responded").length
  playbook += `\nRESUMEN: ${responded} avanzaron la conversación de ${entries.length} respuestas totales.`
  playbook += `\nUsá estos aprendizajes para calibrar tu tono y estrategia.\n`

  return playbook
}
