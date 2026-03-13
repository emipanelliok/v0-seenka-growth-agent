// Test Seenka MCP server - discover available tools
const API_KEY = process.env.SEENKA_MCP_API_KEY || "sk_seenka_TPsvHcA7eYb6OB3e3vHCRXJfy0pODZUOwcQroWb9qWQ"

async function callMCP(method, params = {}) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  }

  console.log(`\n--- Calling ${method} ---`)
  console.log("Request:", JSON.stringify(body, null, 2))

  const res = await fetch("https://mcp.seenka.com/mcp", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  console.log("Status:", res.status)
  const text = await res.text()
  console.log("Response:", text.slice(0, 2000))
  return text
}

// 1. Initialize
await callMCP("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "seenka-champions", version: "1.0.0" }
})

// 2. List tools
await callMCP("tools/list")
