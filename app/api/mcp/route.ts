import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Create admin client (bypasses RLS)
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    throw new Error("Missing Supabase credentials")
  }
  
  return createClient(url, key)
}

// Get default user ID
async function getDefaultUserId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("champions")
    .select("user_id")
    .limit(1)
    .single()
  return data?.user_id || null
}

const TOOLS = [
  {
    name: "list_champions",
    description: "Lista todos los champions/prospectos con filtros opcionales",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["listening", "trigger_detected", "contacted", "responded", "opportunity", "paused"] },
        champion_type: { type: "string" },
        company: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_champion",
    description: "Obtiene detalles de un champion por ID o nombre",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        name: { type: "string" }
      }
    }
  },
  {
    name: "create_champion",
    description: "Crea un nuevo champion",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        linkedin_url: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        champion_type: { type: "string" },
        country: { type: "string" }
      },
      required: ["name"]
    }
  },
  {
    name: "update_champion",
    description: "Actualiza un champion existente",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        status: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        notes: { type: "string" }
      },
      required: ["champion_id"]
    }
  },
  {
    name: "list_pending_messages",
    description: "Lista mensajes pendientes en la bandeja",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "log_interaction",
    description: "Registra una interacción con un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        type: { type: "string", enum: ["call", "meeting", "email_sent", "email_received", "linkedin_sent", "linkedin_received", "note"] },
        summary: { type: "string" },
        outcome: { type: "string", enum: ["positive", "neutral", "negative"] }
      },
      required: ["champion_id", "type", "summary"]
    }
  },
  {
    name: "get_interactions",
    description: "Obtiene historial de interacciones de un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string" },
        limit: { type: "number" }
      },
      required: ["champion_id"]
    }
  },
  {
    name: "list_efemerides",
    description: "Lista efemérides activas",
    inputSchema: {
      type: "object",
      properties: {
        active_only: { type: "boolean" }
      }
    }
  },
  {
    name: "get_pipeline_stats",
    description: "Estadísticas del pipeline de ventas",
    inputSchema: { type: "object", properties: {} }
  }
]

// Tool execution
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
        .select("id, name, email, company, role, champion_type, status, country, created_at")
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
        .select("*, champion_clients(*, clients(*))")
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
          email: args.email || null,
          linkedin_url: args.linkedin_url || null,
          company: args.company || null,
          role: args.role || null,
          champion_type: args.champion_type || "other",
          country: args.country || null,
          status: "listening"
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
        .select("*, champions(name, company)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 20)

      if (args.status) query = query.eq("status", args.status)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { messages: data, count: data?.length || 0 }
    }

    case "log_interaction": {
      const { data, error } = await supabase
        .from("champion_interactions")
        .insert({
          user_id: userId,
          champion_id: args.champion_id,
          type: args.type,
          content: args.summary,
          metadata: { outcome: args.outcome || "neutral" }
        })
        .select()
        .single()

      if (error) return { error: error.message }
      return { interaction: data, message: "Interacción registrada" }
    }

    case "get_interactions": {
      const { data, error } = await supabase
        .from("champion_interactions")
        .select("*")
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

      const stats = {
        total: champions?.length || 0,
        listening: 0,
        trigger_detected: 0,
        contacted: 0,
        responded: 0,
        opportunity: 0,
        paused: 0
      }

      champions?.forEach(c => {
        const status = c.status as keyof typeof stats
        if (status in stats) stats[status]++
      })

      return { stats }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

// GET: Server info
export async function GET() {
  return NextResponse.json({
    name: "Growth Agent",
    version: "1.0.0",
    description: "Sistema de gestión de outreach B2B",
    tools: TOOLS
  })
}

// POST: JSON-RPC 2.0 handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, method, params } = body

    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "Growth Agent", version: "1.0.0" },
            capabilities: { tools: {} }
          }
        })

      case "tools/list":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS }
        })

      case "tools/call": {
        const { name, arguments: args } = params || {}
        const result = await executeTool(name, args || {})
        
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          }
        })
      }

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        })
    }
  } catch (error) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" }
    }, { status: 500 })
  }
}

// CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  })
}
