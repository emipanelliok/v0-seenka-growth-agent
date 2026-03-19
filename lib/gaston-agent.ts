/**
 * Gastón Agent — Seenka Growth Agent
 *
 * Flujo de demo:
 *   1. matchChampions(efemeride_id) → lista de champions que matchean por industria/país
 *   2. querySeenkaMCP(brand, country) → datos creativos actuales (últimos 90 días)
 *   3. generateOutreachMessages(champions, seenkaData, efemeride) → un mensaje por champion listo para aprobar
 *
 * Los mensajes NO se envían automáticamente — siempre requieren aprobación manual del usuario.
 * Usa Vercel AI SDK 6 (generateText + tool definitions).
 */

import { generateText, tool } from "ai"
import { createAnthropic } from "@ai-sdk/gateway"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { GASTON_SYSTEM_PROMPT } from "@/lib/prompts"
import { buildOutreachCandidates, type ChampionClient } from "@/lib/outreach-matching"
import { initSeenkaMcpSession, callSeenkaTool } from "@/lib/seenka-mcp"
import type { Champion, Efemeride, EfemerideIndustryData } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GastonChampionMatch {
  champion_id: string
  champion_name: string
  company: string | null
  role: string | null
  country: string | null
  channel: "linkedin" | "email"
  stage: "cold" | "warm" | "reengagement"
  clients: Array<{ client_name: string; sector: string | null; industria: string | null }>
  matchedIndustryData: string | null
}

export interface SeenkaCreativeData {
  brand: string
  country: string
  materials: string[]   // títulos de creatividades — revelan el mensaje creativo
  platforms: string[]   // soportes/plataformas activos
  rawText: string       // texto legible completo para el LLM
}

export interface GastonGeneratedMessage {
  champion_id: string
  champion_name: string
  company: string | null
  role: string | null
  channel: "linkedin" | "email"
  subject?: string          // solo email
  message: string
  seenka_data_used: string  // trazabilidad
  approved: boolean         // siempre false — requiere aprobación manual
}

export interface GastonRunResult {
  efemeride_name: string
  matched_champions: GastonChampionMatch[]
  seenka_insights: SeenkaCreativeData[]
  generated_messages: GastonGeneratedMessage[]
  errors: string[]
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Tool 1: Matchea champions con la efeméride por industria y país.
 */
async function matchChampions(efemeride_id: string): Promise<{
  efemeride: { id: string; name: string; manual_data: string | null; countries: string[]; industries: string[] }
  matched: GastonChampionMatch[]
} | { error: string }> {
  const supabase = await createClient()

  const { data: efemeride, error: efErr } = await supabase
    .from("efemerides")
    .select("*")
    .eq("id", efemeride_id)
    .single()

  if (efErr || !efemeride) {
    return { error: `Efeméride no encontrada: ${efErr?.message}` }
  }

  const { data: industryData } = await supabase
    .from("efemeride_industry_data")
    .select("*")
    .eq("efemeride_id", efemeride_id)

  const { data: champions } = await supabase
    .from("champions")
    .select("*, company:companies(*)")

  if (!champions || champions.length === 0) {
    return { error: "No hay champions cargados" }
  }

  const championIds = (champions as Champion[]).map((c) => c.id)

  const { data: allClients } = await supabase
    .from("champion_clients")
    .select("*")
    .in("champion_id", championIds)

  const { data: interactions } = await supabase
    .from("interactions")
    .select("champion_id, channel, created_at")
    .in("champion_id", championIds)
    .order("created_at", { ascending: false })

  const candidates = buildOutreachCandidates(
    champions as Champion[],
    (allClients as ChampionClient[]) || [],
    (interactions as Array<{ champion_id: string; channel: string; created_at: string }>) || [],
    efemeride as Efemeride,
    (industryData as EfemerideIndustryData[]) || []
  )

  return {
    efemeride: {
      id: efemeride.id,
      name: efemeride.name,
      manual_data: efemeride.manual_data || null,
      countries: efemeride.countries,
      industries: efemeride.industries,
    },
    matched: candidates.map((c) => ({
      champion_id: c.champion.id,
      champion_name: c.champion.name,
      company: typeof c.champion.company === "string" ? c.champion.company : (c.champion.company as { name?: string } | null)?.name || null,
      role: c.champion.role || null,
      country: c.champion.country || null,
      channel: c.channel,
      stage: c.stage,
      clients: c.clients.map((cl) => ({
        client_name: cl.client_name,
        sector: cl.matched_sector || null,
        industria: cl.matched_industria || null,
      })),
      matchedIndustryData: c.matchedIndustryData,
    })),
  }
}

/**
 * Tool 2: Consulta el MCP de Seenka por datos creativos actuales de una marca.
 * Retorna mensajes creativos, plataformas y texto legible para el LLM.
 */
export async function querySeenkaMCP(
  brand: string,
  country = "argentina",
  days_back = 90
): Promise<SeenkaCreativeData | { error: string }> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return { error: "SEENKA_MCP_API_KEY no configurada" }

  try {
    const sessionId = await initSeenkaMcpSession(apiKey)
    if (!sessionId) return { error: "No se pudo iniciar sesión MCP" }

    // Buscar nombre canónico de la marca
    const entityRaw = await callSeenkaTool(apiKey, sessionId, "seenka_search_entities", { term: brand }, 2)
    let canonicalBrand = brand
    try {
      const parsed = JSON.parse(entityRaw)
      if (Array.isArray(parsed) && parsed[0]?.name) canonicalBrand = parsed[0].name
    } catch { /* usar nombre original */ }

    // Creatividades/materiales → revelan el mensaje creativo
    const assetsRaw = await callSeenkaTool(apiKey, sessionId, "seenka_query", {
      data: "asset_name", brand: canonicalBrand, country, days_back, limit: 15,
    }, 3)

    // Soportes/plataformas activas
    const supportsRaw = await callSeenkaTool(apiKey, sessionId, "seenka_query", {
      data: "support", brand: canonicalBrand, country, days_back, units: "frequency", limit: 10,
    }, 4)

    const parseNames = (raw: string): string[] => {
      const result: string[] = []
      try {
        const parsed = JSON.parse(raw)
        const rows = parsed?.data?.data || parsed?.data || (Array.isArray(parsed) ? parsed : [])
        for (const row of rows) {
          if (row?.name && row.name !== "-") result.push(row.name)
        }
      } catch { /* noop */ }
      return result
    }

    const materials = parseNames(assetsRaw)
    const platforms = parseNames(supportsRaw)

    const lines = [
      `DATOS CREATIVOS DE ${canonicalBrand.toUpperCase()} (últimos ${days_back} días, ${country})`,
      "============================================",
    ]
    if (materials.length > 0) {
      lines.push("", "MENSAJES/CREATIVIDADES ACTIVAS:")
      materials.forEach((m) => lines.push(`  - ${m}`))
    }
    if (platforms.length > 0) {
      lines.push("", "PLATAFORMAS ACTIVAS:")
      platforms.forEach((p) => lines.push(`  - ${p}`))
    }

    return { brand: canonicalBrand, country, materials, platforms, rawText: lines.join("\n") }
  } catch (e) {
    return { error: `Error MCP: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Tool 3: Genera un mensaje personalizado por champion usando datos reales.
 * Primer mensaje NUNCA menciona Seenka — solo dato creativo + pregunta. Máx 60 palabras.
 */
export async function generateOutreachMessage(
  champ: GastonChampionMatch,
  seenkaData: SeenkaCreativeData[],
  efemeride: { name: string; manual_data: string | null }
): Promise<GastonGeneratedMessage> {
  // Encontrar datos relevantes para este champion
  let relevantData: SeenkaCreativeData | null = null
  let dataUsed = ""

  for (const client of champ.clients) {
    const match = seenkaData.find(
      (d) =>
        d.brand.toLowerCase().includes(client.client_name.toLowerCase()) ||
        client.client_name.toLowerCase().includes(d.brand.toLowerCase())
    )
    if (match) { relevantData = match; dataUsed = `datos de ${match.brand}`; break }
  }

  if (!relevantData && champ.company) {
    const match = seenkaData.find(
      (d) =>
        d.brand.toLowerCase().includes(champ.company!.toLowerCase()) ||
        champ.company!.toLowerCase().includes(d.brand.toLowerCase())
    )
    if (match) { relevantData = match; dataUsed = `datos de ${match.brand}` }
  }

  // Construir contexto
  const contextParts: string[] = []
  if (relevantData?.rawText) contextParts.push(`DATO SEENKA ACTUAL:\n${relevantData.rawText}`)
  if (efemeride.manual_data) contextParts.push(`CONTEXTO HISTÓRICO (${efemeride.name}):\n${efemeride.manual_data}`)
  if (contextParts.length === 0) contextParts.push(`Efeméride: ${efemeride.name}\n(sin datos específicos — usá tendencias generales del sector publicitario LATAM)`)

  const clientList = champ.clients.length > 0
    ? champ.clients.map((c) => c.client_name).join(", ")
    : "sus cuentas"

  const isEmail = champ.channel === "email"

  const prompt = `${GASTON_SYSTEM_PROMPT}

---
CHAMPION:
- Nombre: ${champ.champion_name}
- Rol: ${champ.role || "profesional de publicidad/marketing"}
- Empresa: ${champ.company || "agencia/empresa"}
- Clientes relevantes: ${clientList}
- Canal: ${champ.channel} | Stage: ${champ.stage}

${contextParts.join("\n\n")}

---
INSTRUCCIÓN: Generá el PRIMER MENSAJE para ${champ.champion_name}.
${isEmail ? "Es EMAIL. Format:\nASUNTO: [máx 8 palabras]\n\n[cuerpo]" : "Es LINKEDIN. Solo el cuerpo del mensaje."}

REGLAS:
- NO menciones Seenka ni ningún producto
- Usá datos EXACTOS del contexto. NUNCA inventes ni redondees
- Máximo 60 palabras en el cuerpo
- Terminá con "— Gastón"`

  try {
    const anthropic = createAnthropic()
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      prompt,
      maxTokens: 200,
    })

    const raw = result.text.trim()
    let subject: string | undefined
    let message = raw

    if (isEmail) {
      const subjectMatch = raw.match(/^ASUNTO:\s*(.+)/m)
      if (subjectMatch) {
        subject = subjectMatch[1].trim()
        message = raw.replace(/^ASUNTO:\s*.+\n?/m, "").trim()
      }
    }

    return {
      champion_id: champ.champion_id,
      champion_name: champ.champion_name,
      company: champ.company,
      role: champ.role,
      channel: champ.channel,
      subject,
      message,
      seenka_data_used: dataUsed || "sin datos MCP",
      approved: false,
    }
  } catch (e) {
    return {
      champion_id: champ.champion_id,
      champion_name: champ.champion_name,
      company: champ.company,
      role: champ.role,
      channel: champ.channel,
      message: `[Error: ${e instanceof Error ? e.message : String(e)}]`,
      seenka_data_used: dataUsed,
      approved: false,
    }
  }
}

// ─── Vercel AI SDK tool definitions (para uso en generateText agentic) ────────

export const gastonTools = {
  match_champions: tool({
    description: "Matchea champions con una efeméride por industria y país",
    parameters: z.object({ efemeride_id: z.string() }),
    execute: async ({ efemeride_id }) => matchChampions(efemeride_id),
  }),

  query_seenka_mcp: tool({
    description: "Consulta datos creativos actuales de una marca en el MCP de Seenka",
    parameters: z.object({
      brand: z.string(),
      country: z.string().default("argentina"),
      days_back: z.number().default(90),
    }),
    execute: async ({ brand, country, days_back }) => querySeenkaMCP(brand, country, days_back),
  }),

  generate_message: tool({
    description: "Genera un mensaje personalizado para un champion usando datos reales",
    parameters: z.object({
      champion: z.object({
        champion_id: z.string(),
        champion_name: z.string(),
        company: z.string().nullable(),
        role: z.string().nullable(),
        country: z.string().nullable(),
        channel: z.enum(["linkedin", "email"]),
        stage: z.enum(["cold", "warm", "reengagement"]),
        clients: z.array(z.object({
          client_name: z.string(),
          sector: z.string().nullable(),
          industria: z.string().nullable(),
        })),
        matchedIndustryData: z.string().nullable(),
      }),
      seenka_data: z.array(z.object({
        brand: z.string(),
        country: z.string(),
        materials: z.array(z.string()),
        platforms: z.array(z.string()),
        rawText: z.string(),
      })),
      efemeride: z.object({
        name: z.string(),
        manual_data: z.string().nullable(),
      }),
    }),
    execute: async ({ champion, seenka_data, efemeride }) =>
      generateOutreachMessage(champion, seenka_data, efemeride),
  }),
}

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * runGaston(efemeride_id) — flujo completo:
 *   1. Matchea champions
 *   2. Consulta MCP por los clientes únicos (máx 5 marcas)
 *   3. Genera mensajes personalizados listos para aprobación manual
 */
export async function runGaston(efemeride_id: string): Promise<GastonRunResult> {
  const errors: string[] = []

  // Step 1: Match
  const matchRes = await matchChampions(efemeride_id)
  if ("error" in matchRes) {
    return { efemeride_name: "", matched_champions: [], seenka_insights: [], generated_messages: [], errors: [matchRes.error] }
  }

  const { efemeride, matched } = matchRes

  if (matched.length === 0) {
    return { efemeride_name: efemeride.name, matched_champions: [], seenka_insights: [], generated_messages: [], errors: ["No hay champions que matcheen esta efeméride"] }
  }

  // Step 2: Collect unique brands to query
  const brandsSet = new Set<string>()
  const defaultCountry = matched[0]?.country || "argentina"

  for (const champ of matched) {
    for (const client of champ.clients) {
      if (client.client_name) brandsSet.add(client.client_name)
    }
    if (champ.clients.length === 0 && champ.company) brandsSet.add(champ.company)
  }

  const brands = Array.from(brandsSet).slice(0, 5)
  const seenkaInsights: SeenkaCreativeData[] = []

  for (const brand of brands) {
    const res = await querySeenkaMCP(brand, defaultCountry, 90)
    if ("error" in res) {
      errors.push(`MCP [${brand}]: ${res.error}`)
    } else {
      seenkaInsights.push(res)
    }
  }

  // Step 3: Generate messages
  const generatedMessages: GastonGeneratedMessage[] = []

  for (const champ of matched) {
    const msg = await generateOutreachMessage(champ, seenkaInsights, efemeride)
    generatedMessages.push(msg)
  }

  return {
    efemeride_name: efemeride.name,
    matched_champions: matched,
    seenka_insights: seenkaInsights,
    generated_messages: generatedMessages,
    errors,
  }
}
