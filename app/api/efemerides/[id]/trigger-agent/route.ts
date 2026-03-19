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
            eventDate: efemeride.event_date,
          })

        }
        if (mcpCache[primaryClient]) return mcpCache[primaryClient]
      }

      // Fallback: sector data from efemeride industries
      if (efemeride.industries?.length > 0) {
        const sectorKey = `sector:${efemeride.industries[0]}:${countryStr}`
        if (!(sectorKey in mcpCache)) {
          mcpCache[sectorKey] = await getSeenkaDataForSector(efemeride.industries[0], countryStr, efemeride.event_date, efemeride.name)
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

        // Debug: log what data actually reached the LLM
        console.log(`[trigger-agent] ${champion.name} | contextData: ${contextData ? `${contextData.length} chars` : "NULL"} | manual_data: ${manualData ? "yes" : "no"}`)
        if (contextData) console.log(`[trigger-agent] contextData preview: ${contextData.substring(0, 300)}`)

        const seenkaContext = contextData
          ? `DESCRIPCIONES REALES DE SPOTS PUBLICITARIOS (fuente: Seenka):
${contextData}

CÓMO USAR ESTOS DATOS:
- Cada línea entre corchetes es la descripción real de un spot que pautó esa marca.
- Citá esa descripción casi textualmente en el mensaje. NO la parafrasees ni inventes otra versión.
- Ejemplo correcto: "Vi que Mercado Libre salió con 'hasta 45% de descuento y 18 cuotas sin interés' para el Hot Sale — ¿cómo lo trabajaron desde la agencia?"
- Ejemplo INCORRECTO: "Mercado Libre está yendo con ofertas exclusivas" — eso es vago e inventado.
- Elegí el spot más relevante para los clientes de esta persona. No uses el mismo para todos.`
          : `SIN DATOS DE SEENKA DISPONIBLES:
- NO inventes que "X marca comunicó Y" ni supongas creatividades.
- Hacé una pregunta abierta: "¿Cómo están encarando ${efemeride.name} este año con [cliente]?"
- El mensaje debe dejar claro que querés entender su situación, no que tenés datos.`

        const personalizationInstruction = primaryClient
          ? `PERSONALIZACIÓN OBLIGATORIA: El mensaje DEBE mencionar "${primaryClient}" (o alguna de estas marcas: ${clientBrandsText}) de forma específica. No mandes el mismo mensaje genérico que le mandarías a cualquiera.`
          : "No tenemos marcas específicas del champion, usá el dato de industria general."

        const channelConstraints = channel === "email"
          ? `FORMATO: Email. Esquema EXACTO — no agregues ni saques nada:

Subject: [nombre de la marca/cliente. Máximo 6 palabras.]

Hola [Nombre],

[1 sola oración con el dato real de Seenka — citá el texto del spot casi literalmente.]

[1 sola pregunta de cierre — natural, corta, referida a su trabajo con esa marca.]

— Gastón

REGLAS DURAS: tuteo argentino (voseo), sin emojis, sin bullets, sin markdown. UNA SOLA PREGUNTA, no dos. Sin frases de relleno como "con la efeméride a la vista" o "es clave planificar". Solo el dato y la pregunta. Reemplazá [Nombre] con el nombre real.`
          : `FORMATO: LinkedIn DM. Esquema EXACTO:

Hola [Nombre], [1 oración con el dato real del spot de la marca.] [1 pregunta corta de cierre.]

— Gastón

REGLAS: máximo 300 caracteres total, voseo, sin emojis, UNA SOLA PREGUNTA. Reemplazá [Nombre] con el nombre real.`

        const prompt = `Sos Gastón, analista de inteligencia creativa publicitaria. Le escribís a un colega de la industria — no estás vendiendo nada, solo compartís algo que viste y que puede servirle.

El gancho siempre es la DESCRIPCIÓN REAL de un spot que pautó una marca relevante para esta persona. Ejemplo:
"Vi que Mercado Libre salió con 'hasta 45% de descuento y 18 cuotas sin interés' para el Hot Sale — ¿cómo lo trabajaron desde la agencia?"
"Frávega fue con 'descuentos en 100.000 productos, envío gratis' — ¿manejás esa cuenta?"

El texto de la descripción del spot ES el mensaje. Usalo casi literalmente. NO parafraseés, NO generalicés, NO inventés variantes.

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
          // Debug: allows verifying what data actually reached the LLM
          data_available: contextData !== null,
          seenka_data_preview: contextData ? contextData.substring(0, 200) : null,
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
