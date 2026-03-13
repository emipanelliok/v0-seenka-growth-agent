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

export async function getSeenkaInsightForBrand(brandName: string, countryRaw: string): Promise<{ text: string } | null> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return null

  const country = resolveCountry(countryRaw)
  const days = 60

  try {
    const sessionId = await initSession(apiKey)
    if (!sessionId) return null

    const canonical = await getCanonicalBrand(apiKey, sessionId, brandName, 2)

    // First get the sector of this brand (using impact since we just need the name)
    const sectorRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "sector", brand: canonical, country: country, days_back: days, limit: 3
    }, 3)
    
    const sectors = parseRows(sectorRaw)
    const sectorName = sectors.length > 0 ? sectors[0].name : "Automoviles"

    // Query SECTOR brands with airtime AND frequency
    const sectorBrandsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "brand", sector: sectorName, country: country, days_back: days, units: "airtime,frequency", limit: 10
    }, 4)

    // Query SECTOR supports with airtime
    const sectorSupportsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "support", sector: sectorName, country: country, days_back: days, units: "airtime,frequency", limit: 8
    }, 5)

    // Query SECTOR media DIGITAL (Meta, Youtube, Portales)
    const digitalMediaRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "media", sector: sectorName, country: country, days_back: days, units: "airtime,frequency", limit: 8
    }, 6)

    // Query SECTOR media TV PAGA specifically
    const tvPagaRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "media", sector: sectorName, country: country, days_back: days, support: "TV Paga", units: "airtime,frequency", limit: 8
    }, 7)

    // Query SECTOR media TV AIRE specifically
    const tvAireRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "media", sector: sectorName, country: country, days_back: days, support: "TV Aire", units: "airtime,frequency", limit: 8
    }, 8)

    // Get asset_name (materiales/creatividades) for the brand
    const assetsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "asset_name", brand: canonical, country: country, days_back: days, limit: 8
    }, 9)

    const lines: string[] = []
    lines.push("SECTOR: " + sectorName + " - ultimos " + days + " dias (" + country + ")")
    lines.push("============================================")

    const brands = parseRows(sectorBrandsRaw)
    if (brands.length > 0) {
      lines.push("")
      lines.push("MARCAS DEL SECTOR (por tiempo de aire y frecuencia):")
      brands.forEach(function(b) {
        const parts = []
        if (b.airtime > 0) parts.push(formatAirtime(b.airtime))
        if (b.frequency > 0) parts.push(formatNumber(b.frequency) + " veces")
        lines.push("  - " + b.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const supports = parseRows(sectorSupportsRaw)
    if (supports.length > 0) {
      lines.push("")
      lines.push("SOPORTES DEL SECTOR:")
      supports.forEach(function(s) {
        const parts = []
        if (s.airtime > 0) parts.push(formatAirtime(s.airtime))
        if (s.frequency > 0) parts.push(formatNumber(s.frequency) + " veces")
        lines.push("  - " + s.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const digitalMedia = parseRows(digitalMediaRaw)
    if (digitalMedia.length > 0) {
      lines.push("")
      lines.push("MEDIOS DIGITALES:")
      digitalMedia.forEach(function(m) {
        const parts = []
        if (m.airtime > 0) parts.push(formatAirtime(m.airtime))
        if (m.frequency > 0) parts.push(formatNumber(m.frequency) + " veces")
        lines.push("  - " + m.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const tvPaga = parseRows(tvPagaRaw)
    if (tvPaga.length > 0) {
      lines.push("")
      lines.push("TV PAGA (canales):")
      tvPaga.forEach(function(m) {
        const parts = []
        if (m.airtime > 0) parts.push(formatAirtime(m.airtime))
        if (m.frequency > 0) parts.push(formatNumber(m.frequency) + " veces")
        lines.push("  - " + m.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    const tvAire = parseRows(tvAireRaw)
    if (tvAire.length > 0) {
      lines.push("")
      lines.push("TV AIRE (canales):")
      tvAire.forEach(function(m) {
        const parts = []
        if (m.airtime > 0) parts.push(formatAirtime(m.airtime))
        if (m.frequency > 0) parts.push(formatNumber(m.frequency) + " veces")
        lines.push("  - " + m.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
      })
    }

    // Parse assets/materiales
    const assets = parseRows(assetsRaw)
    if (assets.length > 0) {
      lines.push("")
      lines.push("MATERIALES/CREATIVIDADES DE " + canonical.toUpperCase() + ":")
      assets.forEach(function(a) {
        lines.push("  - " + a.name)
      })
    }

    const text = lines.join("\n")
    if (text.length < 60) return null
    return { text }
  } catch (e) {
    return null
  }
}

export async function getSeenkaInsightForSector(sectorName: string, countryRaw: string): Promise<{ text: string } | null> {
  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return null

  const country = resolveCountry(countryRaw)
  const days = 60

  try {
    const sessionId = await initSession(apiKey)
    if (!sessionId) return null

    const brandsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "brand", sector: sectorName, country: country, days_back: days, units: "airtime,frequency", limit: 10
    }, 2)
    
    const supportsRaw = await callTool(apiKey, sessionId, "seenka_query", {
      data: "support", sector: sectorName, country: country, days_back: days, units: "airtime,frequency", limit: 8
    }, 3)

    const lines: string[] = []
    lines.push("SECTOR: " + sectorName + " - ultimos " + days + " dias (" + country + ")")
    lines.push("============================================")

    const brands = parseRows(brandsRaw)
    if (brands.length > 0) {
      lines.push("")
      lines.push("MARCAS DEL SECTOR:")
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
      lines.push("SOPORTES DEL SECTOR:")
      supports.forEach(function(s) {
        const parts = []
        if (s.airtime > 0) parts.push(formatAirtime(s.airtime))
        if (s.frequency > 0) parts.push(formatNumber(s.frequency) + " veces")
        lines.push("  - " + s.name + ": " + (parts.length > 0 ? parts.join(", ") : "sin datos"))
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

export async function getSeenkaDataForBrand(brandName: string, context: { efemeridesName?: string; country?: string }): Promise<string | null> {
  const result = await getSeenkaInsightForBrand(brandName, context.country || "argentina")
  return result ? result.text : null
}

export async function getSeenkaDataForSector(sectorName: string, country: string): Promise<string | null> {
  const result = await getSeenkaInsightForSector(sectorName, country)
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
