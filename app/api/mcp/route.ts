import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"

// MCP Protocol - JSON-RPC 2.0 Standard
// https://modelcontextprotocol.io/docs/specification

// API Key for external access (Craft, etc)
const MCP_API_KEY = process.env.MCP_API_KEY || "growth-agent-mcp-key-2024"

// Create admin client for API key auth (bypasses RLS)
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get user ID for API key requests (uses first user or specific one)
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
        status: { type: "string", enum: ["listening", "trigger_detected", "contacted", "responded", "opportunity", "paused"], description: "Filtrar por estado" },
        champion_type: { type: "string", description: "Filtrar por tipo (creative, media, marketing, sales)" },
        company: { type: "string", description: "Filtrar por empresa" },
        limit: { type: "number", description: "Límite de resultados (default 20)" }
      }
    }
  },
  {
    name: "get_champion",
    description: "Obtiene detalles completos de un champion por ID o nombre",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "ID del champion" },
        name: { type: "string", description: "Nombre del champion (búsqueda parcial)" }
      }
    }
  },
  {
    name: "create_champion",
    description: "Crea un nuevo champion/prospecto",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre completo" },
        email: { type: "string", description: "Email" },
        linkedin_url: { type: "string", description: "URL de LinkedIn" },
        company: { type: "string", description: "Empresa" },
        role: { type: "string", description: "Cargo" },
        champion_type: { type: "string", enum: ["creative", "media", "marketing", "sales", "strategy", "other"] },
        country: { type: "string", description: "País" }
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
        champion_id: { type: "string", description: "ID del champion (requerido)" },
        status: { type: "string", enum: ["listening", "trigger_detected", "contacted", "responded", "opportunity", "paused"] },
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
    description: "Lista mensajes pendientes en la bandeja de salida",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "sent", "rejected"] },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "generate_message",
    description: "Genera un mensaje personalizado con AI para un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "ID del champion" },
        channel: { type: "string", enum: ["email", "linkedin", "whatsapp"] },
        context: { type: "string", description: "Contexto adicional (efeméride, trigger, etc)" }
      },
      required: ["champion_id", "channel"]
    }
  },
  {
    name: "send_email",
    description: "Envía un email a un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "ID del champion" },
        subject: { type: "string", description: "Asunto del email" },
        message: { type: "string", description: "Cuerpo del mensaje" }
      },
      required: ["champion_id", "subject", "message"]
    }
  },
  {
    name: "log_interaction",
    description: "Registra una interacción (llamada, reunión, respuesta) con un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "ID del champion" },
        type: { type: "string", enum: ["call", "meeting", "email_sent", "email_received", "linkedin_sent", "linkedin_received", "note"] },
        summary: { type: "string", description: "Resumen de la interacción" },
        outcome: { type: "string", enum: ["positive", "neutral", "negative"] }
      },
      required: ["champion_id", "type", "summary"]
    }
  },
  {
    name: "get_interactions",
    description: "Obtiene el historial de interacciones de un champion",
    inputSchema: {
      type: "object",
      properties: {
        champion_id: { type: "string", description: "ID del champion" },
        limit: { type: "number", description: "Límite de resultados" }
      },
      required: ["champion_id"]
    }
  },
  {
    name: "list_efemerides",
    description: "Lista efemérides activas (Hot Sale, Black Friday, etc)",
    inputSchema: {
      type: "object",
      properties: {
        active_only: { type: "boolean", description: "Solo efemérides activas" }
      }
    }
  },
  {
    name: "get_pipeline_stats",
    description: "Obtiene estadísticas del pipeline de ventas",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
]

// Tool execution handlers
async function executeTool(name: string, args: Record<string, unknown>, apiKeyAuth: boolean = false) {
  console.log("[v0 MCP] executeTool called with:", name)
  
  let supabase
  let userId: string | null = null

  try {
    // Always try admin client first for MCP requests (external calls)
    supabase = createAdminClient()
    userId = await getDefaultUserId(supabase)
    console.log("[v0 MCP] Got userId:", userId)
    
    if (!userId) {
      // Fallback: try session auth
      console.log("[v0 MCP] No userId from admin, trying session auth")
      try {
        const sessionClient = await createServerClient()
        const { data: { user } } = await sessionClient.auth.getUser()
        if (user) {
          console.log("[v0 MCP] Got user from session:", user.id)
          supabase = sessionClient
          userId = user.id
        }
      } catch (e) {
        console.log("[v0 MCP] Session auth failed:", e)
      }
    }
  } catch (e) {
    console.error("[v0 MCP] Error creating admin client:", e)
  }

  if (!userId) {
    console.error("[v0 MCP] NO USER ID FOUND!")
    return { error: "No se encontró usuario. Verificá que haya datos en la base." }
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
      return { champion: data, message: `Champion ${args.name} creado exitosamente` }
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

    case "generate_message": {
      // Get champion data
      const { data: champion } = await supabase
        .from("champions")
        .select("*, champion_clients(*, clients(*))")
        .eq("id", args.champion_id)
        .single()

      if (!champion) return { error: "Champion no encontrado" }

      // Call AI endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://v0-seenka-growth-agent.vercel.app"}/api/ai/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion,
          clients: champion.champion_clients?.map((cc: { clients: unknown }) => cc.clients) || [],
          channel: args.channel,
          context: args.context || ""
        })
      })

      const result = await res.json()
      return { message: result.message, champion: champion.name }
    }

    case "send_email": {
      const { data: champion } = await supabase
        .from("champions")
        .select("name, email")
        .eq("id", args.champion_id)
        .single()

      if (!champion?.email) return { error: "Champion no tiene email" }

      // Call email endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://v0-seenka-growth-agent.vercel.app"}/api/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: champion.email,
          subject: args.subject,
          body: args.message
        })
      })

      if (!res.ok) return { error: "Error enviando email" }

      // Log interaction
      await supabase.from("champion_interactions").insert({
        user_id: userId,
        champion_id: args.champion_id,
        type: "email_sent",
        content: args.message,
        metadata: { subject: args.subject }
      })

      return { success: true, message: `Email enviado a ${champion.name}` }
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

      // Update champion status if positive outcome
      if (args.outcome === "positive" && args.type !== "note") {
        await supabase
          .from("champions")
          .update({ status: "responded" })
          .eq("id", args.champion_id)
      }

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

// MCP Protocol Handler
export async function GET() {
  // Return server info for discovery
  return NextResponse.json({
    name: "Growth Agent",
    version: "1.0.0",
    description: "Sistema de gestión de outreach B2B - champions, mensajes, interacciones, efemérides",
    tools: TOOLS
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log("[v0 MCP] Request method:", body.method)
    console.log("[v0 MCP] Request params:", body.params?.name || body.params)
    
    // JSON-RPC 2.0 format
    const { jsonrpc, id, method, params } = body

    // Handle different MCP methods
    switch (method) {
      case "initialize":
        console.log("[v0 MCP] Initialize called")
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "Growth Agent",
              version: "1.0.0"
            },
            capabilities: {
              tools: {}
            }
          }
        })

      case "tools/list":
        console.log("[v0 MCP] Tools/list called")
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS
          }
        })

      case "tools/call": {
        const { name, arguments: args } = params || {}
        console.log("[v0 MCP] Tools/call:", name)
        
        try {
          const result = await executeTool(name, args || {}, true)
          console.log("[v0 MCP] Result:", result)
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result
          })
        } catch (error) {
          console.error("[v0 MCP] Tool execution error:", error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32603,
              message: "Error ejecutando herramienta: " + (error instanceof Error ? error.message : String(error))
            }
          })
        }
      }

      default:
        console.log("[v0 MCP] Unknown method:", method)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: "Unknown method: " + method
          }
        })
    }
  } catch (error) {
    console.error("[v0 MCP] General error:", error)
    return NextResponse.json({
      error: "Error en MCP: " + (error instanceof Error ? error.message : String(error))
    }, { status: 500 })
  }
}
          }
        })

      case "tools/list":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS
          }
        })

      case "tools/call": {
        const { name, arguments: args } = params || {}
        const result = await executeTool(name, args || {}, true)
        
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        })
      }

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        })
    }
  } catch (error) {
    console.error("MCP Error:", error)
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal error"
      }
    }, { status: 500 })
  }
}

// Handle OPTIONS for CORS
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
