import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { matchChampionToEfemeride, getStageFromInteractions } from "@/lib/outreach-matching"
import { getSeenkaDataForBrand, getSeenkaDataForSector } from "@/lib/seenka-mcp"

export const maxDuration = 60

// Champion types that work with any industry (agencies, consultants)
const AGENCY_TYPES = new Set(["creative", "media", "strategy"])

function resolveCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  const map: Record<string, string> = {
    argentina: "AR", arg: "AR",
    méxico: "MX", mexico: "MX", mex: "MX",
    colombia: "CO", col: "CO",
    chile: "CL",
    perú: "PE", peru: "PE",
    brasil: "BR", brazil: "BR",
    "estados unidos": "US", "united states": "US",
  }
  for (const [key, code] of Object.entries(map)) {
    if (lower.includes(key)) return code
  }
  // Fallback: treat as ISO code directly
  return raw.trim().toUpperCase().slice(0, 2)
}

function passesCountryCheck(champion: any, efemeride: any): boolean {
  if (!champion.country) return true // no country → don't exclude
  if (!efemeride.countries || efemeride.countries.length === 0) return true
  const code = resolveCountryCode(champion.country)
  return code ? efemeride.countries.includes(code) : true
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: efemerideId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // 1. Load efemeride
    const { data: efemeride } = await supabase
      .from("efemerides")
      .select("*")
      .eq("id", efemerideId)
      .single()

    if (!efemeride) {
      return NextResponse.json({ error: "Efeméride no encontrada" }, { status: 404 })
    }

    // 2. Load all data in parallel
    const [
      { data: champions },
      { data: industryData },
    ] = await Promise.all([
      supabase.from("champions").select("*").eq("user_id", user.id).not("status", "eq", "paused"),
      supabase.from("efemeride_industry_data").select("*").eq("efemeride_id", efemerideId),
    ])

    if (!champions || champions.length === 0) {
      return NextResponse.json({ error: "No hay champions cargados" }, { status: 400 })
    }

    const championIds = champions.map((c: any) => c.id)

    const [
      { data: allClients },
      { data: interactions },
      { data: existingQueued },
    ] = await Promise.all([
      supabase.from("champion_clients").select("*").in("champion_id", championIds),
      supabase.from("interactions").select("champion_id, channel, created_at").in("champion_id", championIds),
      supabase.from("outreach_queue")
        .select("champion_id")
        .eq("efemeride_id", efemerideId)
        .in("status", ["pending_review", "approved", "sending", "sent"]),
    ])

    const alreadyQueuedIds = new Set((existingQueued || []).map((q: any) => q.champion_id))

    // 3. Match candidates with agency type override
    type Candidate = {
      champion: any
      clients: any[]
      stage: "cold" | "warm" | "reengagement"
      channel: "email" | "linkedin"
      matchedData: string | null
    }

    const candidates: Candidate[] = []

    for (const champion of champions) {
      if (alreadyQueuedIds.has(champion.id)) continue

      const channel: "email" | "linkedin" | null = champion.email
        ? "email"
        : champion.linkedin_url
        ? "linkedin"
        : null
      if (!channel) continue

      if (!passesCountryCheck(champion, efemeride)) continue

      const champClients = (allClients || []).filter((c: any) => c.champion_id === champion.id)
      const stage = getStageFromInteractions(champion.id, interactions || [])

      // Agency types always match after country check
      if (AGENCY_TYPES.has(champion.champion_type)) {
        candidates.push({ champion, clients: champClients, stage, channel, matchedData: null })
        continue
      }

      // Standard industry match for non-agency types
      const { matches, matchedData } = matchChampionToEfemeride(
        champion, champClients, efemeride, industryData || []
      )
      if (matches) {
        candidates.push({ champion, clients: champClients, stage, channel, matchedData })
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        efemeride_id: efemerideId,
        efemeride_name: efemeride.name,
        matched: 0,
        generated: 0,
        skipped: existingQueued?.length || 0,
        results: [],
        message: "No hay champions para esta efeméride (ya encolados o no matchean).",
      })
    }

    // 4. Days until event for timing context
    const eventDate = new Date(efemeride.event_date + "T00:00:00")
    const nowUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    )
    const daysUntil = Math.ceil((eventDate.getTime() - nowUtc) / (1000 * 60 * 60 * 24))

    let timingContext = ""
    if (daysUntil > 30) timingContext = `Faltan ${daysUntil} días. Planificación temprana.`
    else if (daysUntil > 14) timingContext = `Faltan ${daysUntil} días. Etapa de ejecución.`
    else if (daysUntil > 0) timingContext = `Faltan solo ${daysUntil} días. Último momento.`
    else if (daysUntil === 0) timingContext = "El evento es HOY."
    else timingContext = `El evento fue hace ${Math.abs(daysUntil)} días. Recap post-evento.`

    // 5. Determine data strategy:
    //    - If efemeride has manual_data → use it for everyone (real curated data, skip MCP)
    //    - Otherwise → query Seenka MCP per champion/brand (cache within request)
    const manualData: string | null = efemeride.manual_data || null
    const mcpCache: Record<string, string | null> = {}

    async function getContextData(clients: any[], champion: any): Promise<string | null> {
      // manual_data takes absolute priority
      if (manualData) return manualData

      const champCountry = resolveCountryCode(champion.country) || "AR"
      const countryMap: Record<string, string> = {
        AR: "argentina", MX: "mexico", CO: "colombia", CL: "chile", PE: "peru", BR: "brasil",
      }
      const countryStr = countryMap[champCountry] || "argentina"

      // Try primary client brand first
      const primaryClient = clients[0]?.client_name || null
      if (primaryClient) {
        if (!(primaryClient in mcpCache)) {
          mcpCache[primaryClient] = await getSeenkaDataForBrand(primaryClient, {
            efemeridesName: efemeride.name,
            country: countryStr,
          })

        }
        if (mcpCache[primaryClient]) return mcpCache[primaryClient]
      }

      // Fallback: sector data from efemeride industries
      if (efemeride.industries?.length > 0) {
        const sectorKey = `sector:${efemeride.industries[0]}:${countryStr}`
        if (!(sectorKey in mcpCache)) {
          mcpCache[sectorKey] = await getSeenkaDataForSector(efemeride.industries[0], countryStr, efemeride.name)
        }
        if (mcpCache[sectorKey]) return mcpCache[sectorKey]
      }

      return null
    }

    // 6. Generate messages and save to outreach_queue
    const results: Array<{
      champion_id: string
      champion_name: string
      champion_company: string | null
      channel: "email" | "linkedin"
      message: string
      subject_line: string | null
      outreach_queue_id: string | null
    }> = []
    const errors: string[] = []

    for (const candidate of candidates) {
      try {
        const { champion, clients, stage, channel, matchedData } = candidate

        const clientsInfo = clients.length > 0
          ? clients.map((c: any) => {
              const parts = [c.client_name]
              if (c.matched_sector) parts.push(`sector: ${c.matched_sector}`)
              if (c.matched_industria) parts.push(`industria: ${c.matched_industria}`)
              return parts.join(" (") + (parts.length > 1 ? ")" : "")
            }).join(", ")
          : "No tenemos info de qué clientes maneja"

        const primaryClient = clients[0]?.client_name || null
        const clientBrandsText = clients.length > 0
          ? clients.map((c: any) => c.client_name).join(", ")
          : null

        let stageContext = ""
        switch (stage) {
          case "cold": stageContext = "Primer contacto, NO nos conoce. Mensaje casual, compartí un dato útil sin vender."; break
          case "warm": stageContext = "Ya tuvimos interacción previa. Podés ser más directo."; break
          case "reengagement": stageContext = "Fue cliente o tuvo demo. Usá la efeméride como excusa para retomar."; break
        }

        const contextData = matchedData || await getContextData(clients, champion)

        const seenkaContext = contextData
          ? `DATOS PUBLICITARIOS DISPONIBLES (extraé de acá el ángulo creativo — qué están comunicando las marcas, no cuánto gastan):
${contextData}

CÓMO INTERPRETAR ESTOS DATOS:
- Si ves "segundos de airtime" → no los menciones. En cambio, inferí que esa marca está apostando fuerte a TV y hablá del MESSAGE que probablemente está comunicando.
- Si ves nombres de marcas → elegí la más relevante para ESTA persona según sus clientes.
- El insight tiene que ser del tipo: "[Marca] está yendo con [territorio creativo / promesa / tono]" — no "[Marca] invirtió X pesos".
- Cada mensaje debe enfocarse en UN ángulo distinto. No repitas la misma estructura para todos los champions.`
          : "No hay datos específicos disponibles. Escribí sobre la tendencia creativa general del sector para esta efeméride — qué suelen comunicar las marcas en esta fecha."

        const personalizationInstruction = primaryClient
          ? `PERSONALIZACIÓN OBLIGATORIA: El mensaje DEBE mencionar "${primaryClient}" (o alguna de estas marcas: ${clientBrandsText}) de forma específica. No mandes el mismo mensaje genérico que le mandarías a cualquiera.`
          : "No tenemos marcas específicas del champion, usá el dato de industria general."

        const channelConstraints = channel === "email"
          ? `FORMATO: Email. Seguí este esquema EXACTO, respetando los saltos de línea:

Subject: [Incluí el nombre de una de las marcas/clientes que maneja la persona. Máximo 8 palabras.]

Hola [Nombre],

¿Cómo estás?

[Párrafo 1: arrancá con el dato concreto de Seenka.]

[Párrafo 2: contexto de la tendencia, máximo 2 oraciones.]

[CTA: una sola pregunta natural.]

[nombre]

REGLAS: tuteo argentino (voseo), sin emojis, sin bullets, sin asteriscos, sin markdown. Reemplazá [Nombre] con el nombre real de la persona.`
          : `FORMATO: LinkedIn DM. Seguí este esquema EXACTO:

Hola [Nombre], ¿cómo estás? [1 oración con el dato concreto referido a una de sus marcas/clientes.] [1 pregunta natural de cierre.]

REGLAS: máximo 300 caracteres en total, tuteo argentino (voseo), sin emojis, sin markdown. Reemplazá [Nombre] con el nombre real de la persona.`

        const prompt = `Sos Gastón, analista de inteligencia creativa publicitaria. Le escribís a un colega de la industria — no estás vendiendo nada, solo compartís algo que viste y que puede servirle.

⚠️ FOCO EXCLUSIVO EN CREATIVIDAD PUBLICITARIA:
Lo que importa es QUÉ ESTÁN COMUNICANDO las marcas hoy: sus mensajes creativos, promesas de valor, tono, territorios creativos, conceptos de campaña.
NO hablés de: inversión publicitaria, segundos de airtime, presupuestos, ventas, ROI, transacciones, ni métricas de negocio.
El dato tiene que ser del estilo: "Frávega está yendo fuerte con el mensaje de 'precio más bajo garantizado' en TV" o "OnCity está comunicando conveniencia y rapidez en digital".

CONTEXTO:
Efeméride: ${efemeride.name}
Fecha: ${efemeride.event_date}
${timingContext}

PERSONA:
Nombre: ${champion.name}
Cargo: ${champion.role || ""}
Empresa: ${champion.company || ""}
País: ${champion.country || ""}
Clientes que maneja: ${clientsInfo}

RELACIÓN: ${stage} — ${stageContext}

${personalizationInstruction}

${seenkaContext}

${channelConstraints}

TONO:
- Tono de "hey, vi esto y me acordé de vos" — espontáneo, directo
- Sin estructura corporativa, sin saludos formales
- Cerrá con UNA sola pregunta corta y natural
- Firmá siempre "— Gastón" (solo eso, nada más)

REGLAS DURAS:
- Español argentino con voseo
- Sin emojis
- NUNCA menciones Seenka en el primer mensaje
- NUNCA inventes datos si no los tenés
- Sin firmas elaboradas
- No inventés datos ni números si no los tenés en los datos de Seenka
- Solo el mensaje, nada más.`

        const { text } = await generateText({
          model: "openai/gpt-4o-mini",
          prompt,
          temperature: 0.7,
          maxTokens: 500,
        })

        // Extract subject line for emails
        let message = text.trim()
        let subjectLine: string | null = null
        if (channel === "email") {
          const subjectMatch = message.match(/^(?:Subject|Asunto):\s*(.+?)(?:\n|$)/i)
          if (subjectMatch) {
            subjectLine = subjectMatch[1].trim()
            message = message.replace(/^(?:Subject|Asunto):\s*.+\n{1,2}/i, "").trim()
          }
        }

        const { data: queueItem } = await supabase
          .from("outreach_queue")
          .insert({
            user_id: user.id,
            efemeride_id: efemerideId,
            champion_id: champion.id,
            channel,
            stage,
            message,
            subject_line: subjectLine,
            seenka_data_used: contextData?.substring(0, 2000) || null,
            status: "pending_review",
          })
          .select("id")
          .single()

        results.push({
          champion_id: champion.id,
          champion_name: champion.name,
          champion_company: champion.company || null,
          channel,
          message,
          subject_line: subjectLine,
          outreach_queue_id: queueItem?.id || null,
        })
      } catch (err) {
        const name = candidate.champion.name || candidate.champion.id
        errors.push(`${name}: ${err instanceof Error ? err.message : "Error"}`)
      }
    }

    return NextResponse.json({
      success: true,
      efemeride_id: efemerideId,
      efemeride_name: efemeride.name,
      matched: candidates.length,
      generated: results.length,
      skipped: existingQueued?.length || 0,
      data_source: manualData ? "manual_data" : "seenka_mcp",
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length} mensajes generados y pendientes de aprobación.`,
    })
  } catch (error) {
    console.error("[trigger-agent] Error:", error)
    return NextResponse.json(
      { error: "Error al ejecutar trigger-agent", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
