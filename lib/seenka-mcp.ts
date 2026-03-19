const MCP_URL = "https://mcp.seenka.com/mcp"

const COUNTRY_MAP: Record<string, string> = {
  ar: "argentina",
  argentina: "argentina",
  mx: "mexico",
  mexico: "mexico",
  co: "colombia",
  colombia: "colombia",
  cl: "chile",
  chile: "chile",
  pe: "peru",
  peru: "peru",
  br: "brasil",
  brasil: "brasil",
}

function resolveCountry(raw: string): string {
  if (!raw) return "argentina"
  const key = raw.toLowerCase().trim()
  if (COUNTRY_MAP[key]) return COUNTRY_MAP[key]
  const keys = Object.keys(COUNTRY_MAP)
  for (let i = 0; i < keys.length; i++) {
    if (key.includes(keys[i])) return COUNTRY_MAP[keys[i]]
  }
  return "argentina"
}

function formatAirtime(seconds: number): string {
  return formatNumber(Math.round(seconds)) + " segundos"
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return Math.round(n / 1000) + "K"
  return String(Math.round(n))
}

function parseRows(raw: string): Array<{ name: string; airtime: number; frequency: number; impact: number }> {
  const result: Array<{ name: string; airtime: number; frequency: number; impact: number }> = []
  try {
    const parsed = JSON.parse(raw)
    const data = parsed && parsed.data && parsed.data.data ? parsed.data.data : (parsed && parsed.data ? parsed.data : [])
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        if (row && row.name && row.name !== "-") {
          result.push({
            name: row.name,
            airtime: row.airtime || 0,
            frequency: row.frequency || 0,
            impact: row.impact || 0
          })
        }
      }
    }
  } catch (e) {
    // not JSON
  }
  return result
}

function parseAssets(raw: string): Array<{ name: string; description: string; keywords: string; brands: string }> {
  const result: Array<{ name: string; description: string; keywords: string; brands: string }> = []
  try {
    const parsed = JSON.parse(raw)
    const data = parsed && parsed.data && parsed.data.data ? parsed.data.data : (parsed && parsed.data ? parsed.data : [])
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        if (row && (row.description || row.name)) {
          result.push({
            name: row.name || "",
            description: row.description || "",
            keywords: row.keywords || "",
            brands: row.brands || row.brand || "",
          })
        }
      }
    }
  } catch (e) {
    // not JSON
  }
  return result
}

async function mcpPost(apiKey: string, sessionId: string, id: number, method: string, params: Record<string, unknown>): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "Mcp-Session-Id": sessionId,
  }

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })

  const text = await res.text()

  if (text.startsWith("data:")) {
    const lines = text.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.startsWith("data:")) continue
      try {
        const parsed = JSON.parse(line.replace("data:", "").trim())
        if (parsed && parsed.result !== undefined) {
          const content = parsed.result.content
          if (Array.isArray(content) && content[0] && content[0].text) {
            return content[0].text
          }
          return JSON.stringify(parsed.result)
        }
      } catch (e) {
        // skip
      }
    }
  }

  try {
    const parsed = JSON.parse(text)
    if (parsed && parsed.result) {
      const content = parsed.result.content
      if (Array.isArray(content) && content[0] && content[0].text) {
        return content[0].text
      }
      return JSON.stringify(parsed.result)
    }
  } catch (e) {
    // not JSON
  }

  return ""
}

async function initSession(apiKey: string): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  }

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "seenka-champions", version: "1.0.0" },
      },
    }),
  })

  const sessionId = res.headers.get("Mcp-Session-Id") || res.headers.get("mcp-session-id") || ""
  return sessionId
}

async function callTool(apiKey: string, sessionId: string, toolName: string, toolParams: Record<string, unknown>, id: number): Promise<string> {
  return mcpPost(apiKey, sessionId, id, "tools/call", {
    name: toolName,
    arguments: { params: toolParams },
  })
}

async function getCanonicalBrand(apiKey: string, sessionId: string, brandName: string, id: number): Promise<string> {
  const raw = await callTool(apiKey, sessionId, "seenka_search_entities", { term: brandName }, id)
  if (!raw) return brandName
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed[0] && parsed[0].name) {
      return parsed[0].name
    }
  } catch (e) {
    // not JSON array
  }
  const match = raw.match(/^([^\n(,\[{]+)/m)
  if (match) return match[1].trim()
  return brandName
}

export async function getSeenkaInsightForBrand(
  brandName: string,
  countryRaw: string,
  eventDate?: string,  // YYYY-MM-DD de la efeméride
  efemeridesName?: string
): Promise<{ text: string } | null> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return null

  const country = resolveCountry(countryRaw)

  // Calcular rango de fechas: 14 días antes del evento, 7 días después
  // Si no hay eventDate o es futuro → usar days_back general
  function getDateRange(): { start_time: string; end_time: string } | { days_back: number } {
    if (!eventDate) return { days_back: 60 }
    const event = new Date(eventDate + "T00:00:00Z")
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (event > today) return { days_back: 60 } // evento futuro → contexto general
    const start = new Date(event)
    start.setUTCDate(start.getUTCDate() - 14)
    const end = new Date(event)
    end.setUTCDate(end.getUTCDate() + 7)
    return {
      start_time: start.toISOString().slice(0, 10),
      end_time: end.toISOString().slice(0, 10),
    }
  }

  const dateParams = getDateRange()

  try {
    const sessionId = await initSession(apiKey)
    if (!sessionId) return null

    const canonical = await getCanonicalBrand(apiKey, sessionId, brandName, 2)

    // Get sector for context
    const sectorRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "sector", brand: canonical, country: country, days_back: 60, limit: 3
    }, 3)
    const sectors = parseRows(sectorRaw)
    const sectorName = sectors.length > 0 ? sectors[0].name : null

    // Plan A: assets en la ventana de fechas del evento (trae spots reales de la efeméride)
    // Plan B: fallback a últimos 60 días (evento futuro o sin datos históricos)
    let brandAssetsRaw = ""
    if ("start_time" in dateParams) {
      brandAssetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
        data: "asset", brand: canonical, country: country, ...dateParams, limit: 8
      }, 4)
    }
    if (parseAssets(brandAssetsRaw).length === 0) {
      brandAssetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
        data: "asset", brand: canonical, country: country, days_back: 60, limit: 8
      }, 5)
    }

    // Sector assets: misma lógica para contexto competitivo
    let sectorAssetsRaw = ""
    if (sectorName) {
      if ("start_time" in dateParams) {
        sectorAssetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
          data: "asset", sector: sectorName, country: country, ...dateParams, limit: 8
        }, 6)
      }
      if (parseAssets(sectorAssetsRaw).length === 0) {
        sectorAssetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
          data: "asset", sector: sectorName, country: country, days_back: 30, limit: 8
        }, 7)
      }
    }

    const lines: string[] = []
    lines.push(`MARCA: ${canonical} (${country})`)
    if (sectorName) lines.push(`SECTOR: ${sectorName}`)
    lines.push("============================================")

    const brandAssets = parseAssets(brandAssetsRaw)
    if (brandAssets.length > 0) {
      lines.push("")
      lines.push(`CAMPAÑAS ACTIVAS DE ${canonical.toUpperCase()} — qué están comunicando:`)
      brandAssets.forEach(function(a) {
        if (a.description) {
          lines.push(`  [${a.name || "spot"}] ${a.description}`)
          if (a.keywords) lines.push(`    keywords: ${a.keywords}`)
        } else if (a.name) {
          lines.push(`  - ${a.name}`)
        }
      })
    }

    if (sectorName) {
      const sectorAssets = parseAssets(sectorAssetsRaw)
      const otherBrandAssets = sectorAssets.filter(a => a.brands && a.brands.toLowerCase() !== canonical.toLowerCase())
      if (otherBrandAssets.length > 0) {
        lines.push("")
        lines.push(`COMPETIDORES EN ${sectorName.toUpperCase()} — qué están comunicando:`)
        const seen: Record<string, number> = {}
        otherBrandAssets.forEach(function(a) {
          const b = a.brands || "Competidor"
          seen[b] = (seen[b] || 0) + 1
          if (seen[b] > 2) return
          if (a.description) {
            lines.push(`  [${b}] ${a.description}`)
            if (a.keywords) lines.push(`    keywords: ${a.keywords}`)
          } else if (a.name) {
            lines.push(`  [${b}] ${a.name}`)
          }
        })
      }
    }

    const text = lines.join("\n")
    if (text.length < 60) return null
    return { text }
  } catch (e) {
    return null
  }
}

export async function getSeenkaInsightForSector(
  sectorName: string,
  countryRaw: string,
  eventDate?: string,
  efemeridesName?: string
): Promise<{ text: string } | null> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return null

  const country = resolveCountry(countryRaw)

  function getDateRange(): { start_time: string; end_time: string } | { days_back: number } {
    if (!eventDate) return { days_back: 30 }
    const event = new Date(eventDate + "T00:00:00Z")
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (event > today) return { days_back: 30 }
    const start = new Date(event)
    start.setUTCDate(start.getUTCDate() - 14)
    const end = new Date(event)
    end.setUTCDate(end.getUTCDate() + 7)
    return {
      start_time: start.toISOString().slice(0, 10),
      end_time: end.toISOString().slice(0, 10),
    }
  }

  const dateParams = getDateRange()

  try {
    const sessionId = await initSession(apiKey)
    if (!sessionId) return null

    // Plan A: asset_name filter + date range
    // Plan B: solo date range
    // Plan C: fallback días recientes
    let assetsRaw = ""
    if (efemeridesName && "start_time" in dateParams) {
      assetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
        data: "asset", sector: sectorName, country: country, ...dateParams,
        include_filters: { asset_name: efemeridesName },
        limit: 12,
      }, 2)
    }
    if (parseAssets(assetsRaw).length === 0 && "start_time" in dateParams) {
      assetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
        data: "asset", sector: sectorName, country: country, ...dateParams, limit: 12
      }, 3)
    }
    if (parseAssets(assetsRaw).length === 0) {
      assetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
        data: "asset", sector: sectorName, country: country, days_back: 30, limit: 12
      }, 4)
    }

    const lines: string[] = []
    lines.push(`SECTOR: ${sectorName} (${country})`)
    lines.push("============================================")

    const assets = parseAssets(assetsRaw)
    if (assets.length > 0) {
      lines.push("")
      lines.push(`QUÉ ESTÁN COMUNICANDO LAS MARCAS EN ${sectorName.toUpperCase()}:`)
      const seen: Record<string, number> = {}
      assets.forEach(function(a) {
        const b = a.brands || "Marca"
        seen[b] = (seen[b] || 0) + 1
        if (seen[b] > 2) return
        if (a.description) {
          lines.push(`  [${b}] ${a.description}`)
          if (a.keywords) lines.push(`    keywords: ${a.keywords}`)
        } else if (a.name) {
          lines.push(`  [${b}] ${a.name}`)
        }
      })
    }

    const text = lines.join("\n")
    if (text.length < 60) return null
    return { text }
  } catch (e) {
    return null
  }
}

export async function initSeenkaMcpSession(apiKey: string): Promise<string> {
  return initSession(apiKey)
}

export async function callSeenkaTool(apiKey: string, sessionId: string, toolName: string, toolParams: Record<string, unknown>, id: number): Promise<string> {
  return callTool(apiKey, sessionId, toolName, toolParams, id)
}

export async function getSeenkaDataForBrand(brandName: string, context: { efemeridesName?: string; country?: string; eventDate?: string }): Promise<string | null> {
  const result = await getSeenkaInsightForBrand(brandName, context.country || "argentina", context.eventDate, context.efemeridesName)
  return result ? result.text : null
}

export async function getSeenkaDataForSector(sectorName: string, country: string, eventDate?: string, efemeridesName?: string): Promise<string | null> {
  const result = await getSeenkaInsightForSector(sectorName, country, eventDate, efemeridesName)
  return result ? result.text : null
}

export async function getSeenkaInsightForKeyword(
  keywordName: string,
  clientNames?: string[],
  countryRaw?: string
): Promise<{ text: string } | null> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return null

  const country = resolveCountry(countryRaw || "argentina")
  
  try {
    const sessionId = await initSession(apiKey)
    if (!sessionId) return null

    // Query by keyword - includes filters for client brands if provided
    const queryParams: Record<string, unknown> = {
      data: "brand",
      country: country,
      include_filters: {
        keyword: keywordName
      },
      units: "airtime,frequency",
      limit: 15
    }

    // If specific clients are provided, add them to filter
    if (clientNames && clientNames.length > 0) {
      queryParams.include_filters = {
        keyword: keywordName,
        brand: clientNames
      }
    }

    const brandsRaw = await callTool(apiKey, sessionId, "seenka_query", queryParams, 2)

    // Also get supports for this keyword
    const supportsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "support",
      country: country,
      include_filters: {
        keyword: keywordName
      },
      units: "airtime,frequency",
      limit: 8
    }, 3)

    // Get media/channels for this keyword
    const mediaRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "media",
      country: country,
      include_filters: {
        keyword: keywordName
      },
      units: "airtime,frequency",
      limit: 10
    }, 4)

    const lines: string[] = []
    const clientInfo = clientNames && clientNames.length > 0 
      ? `para ${clientNames.join(", ")} - ${keywordName}`
      : keywordName
    lines.push(`DATOS DE "${clientInfo}" (${country})`)
    lines.push("============================================")

    const brands = parseRows(brandsRaw)
    if (brands.length > 0) {
      lines.push("")
      lines.push("MARCAS/INVERSORES EN ESTA CAMPAÑA:")
      brands.forEach(function(b) {
        const parts = []
        if (b.airtime > 0) parts.push(formatAirtime(b.airtime))
        if (b.frequency > 0) parts.push(formatNumber(b.frequency) + " veces")
        lines.push("  - " + b.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const supports = parseRows(supportsRaw)
    if (supports.length > 0) {
      lines.push("")
      lines.push("SOPORTES UTILIZADOS:")
      supports.forEach(function(s) {
        const parts = []
        if (s.airtime > 0) parts.push(formatAirtime(s.airtime))
        if (s.frequency > 0) parts.push(formatNumber(s.frequency) + " veces")
        lines.push("  - " + s.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const media = parseRows(mediaRaw)
    if (media.length > 0) {
      lines.push("")
      lines.push("CANALES/MEDIOS PRINCIPALES:")
      media.forEach(function(m) {
        const parts = []
        if (m.airtime > 0) parts.push(formatAirtime(m.airtime))
        if (m.frequency > 0) parts.push(formatNumber(m.frequency) + " veces")
        lines.push("  - " + m.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const text = lines.join("\n")
    if (text.length < 60) return null
    return { text }
  } catch (e) {
    console.error("[v0] Error getting Seenka data for keyword:", e)
    return null
  }
}

export async function getSeenkaDataForKeyword(
  keyword: string,
  clientNames?: string[],
  country?: string
): Promise<string | null> {
  const result = await getSeenkaInsightForKeyword(keyword, clientNames, country)
  return result ? result.text : null
}
