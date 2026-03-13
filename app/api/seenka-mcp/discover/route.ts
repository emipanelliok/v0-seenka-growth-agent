import { NextResponse } from "next/server"

const MCP_URL = "https://mcp.seenka.com/mcp"

async function mcpPost(apiKey: string, sessionId: string | null, id: number, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  }
  if (sessionId) headers["Mcp-Session-Id"] = sessionId

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })

  const text = await res.text()
  const sessionIdReturned = res.headers.get("Mcp-Session-Id") || res.headers.get("mcp-session-id")

  let parsed: unknown
  if (text.startsWith("data:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"))
    parsed = lines.map((l) => { try { return JSON.parse(l.replace(/^data:\s*/, "")) } catch { return l } })
  } else {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }

  return { status: res.status, parsed, sessionIdReturned }
}

export async function GET() {
  const API_KEY = process.env.SEENKA_MCP_API_KEY
  if (!API_KEY) return NextResponse.json({ error: "SEENKA_MCP_API_KEY not set" }, { status: 500 })

  const results: Record<string, unknown> = {}

  // Initialize
  const init = await mcpPost(API_KEY, null, 1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "seenka-champions", version: "1.0.0" },
  })
  const sessionId = init.sessionIdReturned as string
  results.sessionId = sessionId

  if (!sessionId) {
    return NextResponse.json({ error: "No session ID returned", details: init }, { status: 500 })
  }

  // List tools with full input schemas
  results.tools = await mcpPost(API_KEY, sessionId, 2, "tools/list")

  // Test 1: What sector does Ford belong to?
  results.ford_sector = await mcpPost(API_KEY, sessionId, 3, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "sector", brand: "Ford", country: "argentina", days_back: 60, limit: 5 } },
  })

  // Test 2: Automotive sector — which supports are being used?
  results.auto_by_support = await mcpPost(API_KEY, sessionId, 4, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "support", sector: "Automóviles", country: "argentina", days_back: 60, limit: 10 } },
  })

  // Test 3: Automotive sector — which specific media/channels?
  results.auto_by_media = await mcpPost(API_KEY, sessionId, 5, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "media", sector: "Automóviles", country: "argentina", days_back: 60, limit: 10 } },
  })

  // Test 4: Ford specifically — which channels?
  results.ford_by_media = await mcpPost(API_KEY, sessionId, 6, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "media", brand: "Ford", country: "argentina", days_back: 60, limit: 10 } },
  })

  // Test 5: Ford — which formats? (PNT, spot, banner, etc.)
  results.ford_by_format = await mcpPost(API_KEY, sessionId, 7, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "asset_format", brand: "Ford", country: "argentina", days_back: 60, limit: 10 } },
  })

  // Test 6: Sector brands with AIRTIME unit
  results.sector_brands_airtime = await mcpPost(API_KEY, sessionId, 8, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "brand", sector: "Automóviles", country: "argentina", days_back: 60, unit: "airtime", limit: 10 } },
  })

  // Test 7: Ford creatives
  results.ford_creatives = await mcpPost(API_KEY, sessionId, 9, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "creative", brand: "Ford", country: "argentina", days_back: 60, limit: 5 } },
  })

  // Test 8: Ford ads/assets
  results.ford_ads = await mcpPost(API_KEY, sessionId, 10, "tools/call", {
    name: "seenka_query",
    arguments: { params: { data: "ad", brand: "Ford", country: "argentina", days_back: 60, limit: 5 } },
  })

  return NextResponse.json(results, { status: 200 })
}
