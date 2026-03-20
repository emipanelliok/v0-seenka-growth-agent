import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { buildPlaybook } from "@/lib/gaston-playbook"

// ─── Auth ────────────────────────────────────────────────────────────────────
// Validate Bearer token from MCP client.
// Set MCP_API_TOKEN in Vercel env vars, then paste the same token
// into Craft Agents / Claude Desktop connection settings.
function validateToken(request: NextRequest): boolean {
  const expected = process.env.MCP_API_TOKEN
  if (!expected) return true // no token configured = open access (dev mode)

  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth
  return token === expected
}

function unauthorizedResponse(id: unknown = null) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "Token missing or expired" },
    },
    { status: 401 }
  )
}

// ─── Supabase ────────────────────────────────────────────────────────────────
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase credentials")
  return createClient(url, key)
}

async function getDefaultUserId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("champions")
    .select("user_id")
    .limit(1)
    .single()
  return data?.user_id || null
}

// ─── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_champions",
    description: "List all champions (B2B prospects) with optional filters. Returns name, email, company, status, etc.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["listening", "trigger_detected", "contacted", "responded", "opportunity", "paused", "rejected"], description: "Filter by pipeline status" },
        champion_type: { type: "string", description: "Filter by type (media_agency, brand, etc.)" },
        company: { type: "string", description: "Search by company name (partial match)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_champion",
    description: "Get detailed champion information including clients they manage",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "Champion UUID" },
        name: { type: "string", description: "Search by name (partial match)" },
      },
    },
  },
  {
    name: "create_champion",
    description: "Create a new prospect/champion in the pipeline",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        linkedin_url: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        champion_type: { type: "string" },
        country: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_champion",
    description: "Update champion details (status, email, company, role, notes)",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        status: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        notes: { type: "string" },
      },
      required: ["champion_id"],
    },
  },
  {
    name: "list_pending_messages",
    description: "View pending message queue (outreach ready to send or review)",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending_review", "approved", "sent", "failed"], description: "Filter by status" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "generate_message",
    description: "Generate an AI-powered personalized message for a champion using Gastón's voice. Returns a draft message for email or LinkedIn.",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "Champion UUID" },
        channel: { type: "string", enum: ["email", "linkedin"], description: "Target channel" },
        context: { type: "string", description: "Optional extra context (e.g. 'follow up about credits')" },
      },
      required: ["champion_id", "channel"],
    },
  },
  {
    name: "send_message",
    description: "Queue a message for sending via email or LinkedIn. Creates an entry in the outreach queue with pending_review status.",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "Champion UUID" },
        channel: { type: "string", enum: ["email", "linkedin"] },
        message: { type: "string", description: "Message body" },
        subject_line: { type: "string", description: "Email subject (email only)" },
      },
      required: ["champion_id", "channel", "message"],
    },
  },
  {
    name: "log_interaction",
    description: "Record an interaction with a champion (call, meeting, email, note)",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        type: { type: "string", enum: ["call", "meeting", "email_sent", "email_received", "linkedin_sent", "linkedin_received", "note"] },
        summary: { type: "string" },
        outcome: { type: "string", enum: ["positive", "neutral", "negative"] },
      },
      required: ["champion_id", "type", "summary"],
    },
  },
  {
    name: "get_interactions",
    description: "Get interaction history for a champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        limit: { type: "number" },
      },
      required: ["champion_id"],
    },
  },
  {
    name: "list_efemerides",
    description: "List marketing events/efemérides (date-based triggers)",
    inputSchema: {
      type: "object",
      properties: {
        active_only: { type: "boolean" },
      },
    },
  },
  {
    name: "get_pipeline_stats",
    description: "Get sales pipeline statistics (count by status)",
    inputSchema: { type: "object", properties: {} },
  },
]

// ─── Tool execution ──────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>) {
  const supabase = createAdminClient()
  const userId = await getDefaultUserId(supabase)

  if (!userId) {
    return { error: "No se encontró usuario en la base de datos" }
  }

  switch (name) {
    case "list_champions": {
      let query = supabase
        .from("champions")
        .select("id, name, email, company, role, champion_type, status, country, linkedin_url, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 20)

      if (args.status) query = query.eq("status", args.status)
      if (args.champion_type) query = query.eq("champion_type", args.champion_type)
      if (args.company) query = query.ilike("company", `%${args.company}%`)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { champions: data, count: data?.length || 0 }
    }

    case "get_champion": {
      let query = supabase
        .from("champions")
        .select("*, champion_clients(client_name)")
        .eq("user_id", userId)

      if (args.champion_id) {
        query = query.eq("id", args.champion_id)
      } else if (args.name) {
        query = query.ilike("name", `%${args.name}%`)
      } else {
        return { error: "Necesito champion_id o name" }
      }

      const { data, error } = await query.single()
      if (error) return { error: error.message }
      return { champion: data }
    }

    case "create_champion": {
      const { data, error } = await supabase
        .from("champions")
        .insert({
          user_id: userId,
          name: args.name,
          email: (args.email as string) || null,
          linkedin_url: (args.linkedin_url as string) || null,
          company: (args.company as string) || null,
          role: (args.role as string) || null,
          champion_type: (args.champion_type as string) || "other",
          country: (args.country as string) || null,
          status: "listening",
        })
        .select()
        .single()

      if (error) return { error: error.message }
      return { champion: data, message: `Champion ${args.name} creado` }
    }

    case "update_champion": {
      const updates: Record<string, unknown> = {}
      if (args.status) updates.status = args.status
      if (args.email) updates.email = args.email
      if (args.company) updates.company = args.company
      if (args.role) updates.role = args.role
      if (args.notes) updates.notes = args.notes

      const { data, error } = await supabase
        .from("champions")
        .update(updates)
        .eq("id", args.champion_id)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) return { error: error.message }
      return { champion: data, message: "Champion actualizado" }
    }

    case "list_pending_messages": {
      let query = supabase
        .from("outreach_queue")
        .select("id, champion_id, channel, message, subject_line, status, created_at, sent_at, champions(name, company)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 20)

      if (args.status) query = query.eq("status", args.status)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { messages: data, count: data?.length || 0 }
    }

    case "generate_message": {
      const { data: champ } = await supabase
        .from("champions")
        .select("*, champion_clients(client_name)")
        .eq("id", args.champion_id)
        .eq("user_id", userId)
        .single()

      if (!champ) return { error: "Champion no encontrado" }

      const championClients = champ?.champion_clients?.map((c: any) => c.client_name).join(", ") || "no especificados"
      const isLinkedIn = args.channel === "linkedin"
      const playbook = await buildPlaybook(supabase)

      const { text } = await generateText({
        model: gateway("anthropic/claude-sonnet-4-20250514"),
        prompt: `Sos Gastón, agente de inteligencia publicitaria de Seenka. Seenka monitorea en tiempo real qué comunican las marcas en TV, digital y radio en Latinoamérica.

CONTEXTO:
- Estás hablando con ${champ.name || "esta persona"} (${champ.title || champ.role || "ejecutivo"} en ${champ.company || "su empresa"})
- Clientes que maneja: ${championClients}
- Canal: ${isLinkedIn ? "LinkedIn" : "Email"}
${args.context ? `- Contexto adicional: ${args.context}` : ""}

Generá un mensaje personalizado siguiendo estas reglas:
- Español argentino con voseo
- Sin emojis
- Máx ${isLinkedIn ? "60" : "80"} palabras
- Tono profesional pero cercano
- Priorizá dar valor inmediato: ofrecé $500 USD en créditos con seenka.com/refer + generá un código tipo G seguido de 7 caracteres alfanuméricos random
- La llamada es opcional, nunca el primer paso
${isLinkedIn ? "- Sin firma (LinkedIn ya la muestra)" : "- Firmá como 'Gastón\\nSeenka Media Intelligence'"}
${playbook}
Respondé SOLO el mensaje, sin explicaciones ni comillas.`,
        maxTokens: 500,
      })

      return { message: text.trim(), channel: args.channel, champion: champ.name }
    }

    case "send_message": {
      const { data, error } = await supabase
        .from("outreach_queue")
        .insert({
          user_id: userId,
          champion_id: args.champion_id,
          channel: args.channel,
          message: args.message,
          subject_line: (args.subject_line as string) || null,
          status: "pending_review",
        })
        .select()
        .single()

      if (error) return { error: error.message }
      return { queued: data, message: "Mensaje encolado para revisión" }
    }

    case "log_interaction": {
      const { data, error } = await supabase
        .from("interactions")
        .insert({
          champion_id: args.champion_id,
          channel: args.type === "linkedin_sent" || args.type === "linkedin_received" ? "linkedin" : "email",
          message: args.summary,
          outcome: args.outcome || "neutral",
        })
        .select()
        .single()

      if (error) return { error: error.message }
      return { interaction: data, message: "Interacción registrada" }
    }

    case "get_interactions": {
      const { data, error } = await supabase
        .from("interactions")
        .select("id, channel, message, reply_content, reply_sentiment, outcome, created_at, reply_received_at")
        .eq("champion_id", args.champion_id)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 20)

      if (error) return { error: error.message }
      return { interactions: data, count: data?.length || 0 }
    }

    case "list_efemerides": {
      let query = supabase
        .from("efemerides")
        .select("id, name, description, event_date, industries, countries, is_active")
        .eq("user_id", userId)
        .order("event_date", { ascending: true })

      if (args.active_only) query = query.eq("is_active", true)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { efemerides: data }
    }

    case "get_pipeline_stats": {
      const { data: champions } = await supabase
        .from("champions")
        .select("status")
        .eq("user_id", userId)

      const stats: Record<string, number> = {
        total: champions?.length || 0,
        listening: 0,
        trigger_detected: 0,
        contacted: 0,
        responded: 0,
        opportunity: 0,
        paused: 0,
        rejected: 0,
      }

      champions?.forEach((c) => {
        const status = c.status as string
        if (status in stats) stats[status]++
      })

      return { stats }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

// ─── GET: Server info & discovery ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!validateToken(request)) {
    return NextResponse.json({ error: "Token missing or expired" }, { status: 401 })
  }

  return NextResponse.json({
    name: "Growth Agent",
    version: "1.1.0",
    description: "B2B Sales outreach management, champions, campaigns, and AI-powered messaging",
    tools: TOOLS,
  })
}

// ─── POST: JSON-RPC 2.0 handler ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, method, params } = body

    // Allow initialize without token (handshake)
    if (method !== "initialize" && !validateToken(request)) {
      return unauthorizedResponse(id)
    }

    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "Growth Agent", version: "1.1.0" },
            capabilities: { tools: {} },
          },
        })

      case "tools/list":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        })

      case "tools/call": {
        const { name, arguments: toolArgs } = params || {}
        const result = await executeTool(name, toolArgs || {})

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        })
      }

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        })
    }
  } catch (error) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
      },
      { status: 500 }
    )
  }
}

// ─── CORS ────────────────────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
