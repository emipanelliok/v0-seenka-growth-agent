import { tool } from "ai"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { buildPlaybook } from "@/lib/gaston-playbook"

// Supabase admin client for tool execution
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Build all tools for Gastón chat, scoped to a specific user
export function buildGastonTools(userId: string) {
  const supabase = adminClient()

  return {
    list_champions: tool({
      description: "Lista champions (prospectos B2B) con filtros opcionales. Devuelve nombre, email, empresa, status, etc.",
      parameters: z.object({
        status: z.enum(["listening", "trigger_detected", "contacted", "responded", "opportunity", "paused", "rejected"]).optional().describe("Filtrar por status del pipeline"),
        champion_type: z.string().optional().describe("Filtrar por tipo (media_agency, brand, etc.)"),
        company: z.string().optional().describe("Buscar por empresa (parcial)"),
        limit: z.number().optional().default(20).describe("Máx resultados"),
      }),
      execute: async (args) => {
        let query = supabase
          .from("champions")
          .select("id, name, email, company, role, champion_type, status, country, linkedin_url, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(args.limit || 20)

        if (args.status) query = query.eq("status", args.status)
        if (args.champion_type) query = query.eq("champion_type", args.champion_type)
        if (args.company) query = query.ilike("company", `%${args.company}%`)

        const { data, error } = await query
        if (error) return { error: error.message }
        return { champions: data, count: data?.length || 0 }
      },
    }),

    get_champion: tool({
      description: "Obtener información detallada de un champion, incluyendo clientes que maneja",
      parameters: z.object({
        champion_id: z.string().optional().describe("UUID del champion"),
        name: z.string().optional().describe("Buscar por nombre (parcial)"),
      }),
      execute: async (args) => {
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
      },
    }),

    create_champion: tool({
      description: "Crear un nuevo prospecto/champion en el pipeline",
      parameters: z.object({
        name: z.string().describe("Nombre completo"),
        email: z.string().optional(),
        linkedin_url: z.string().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        champion_type: z.string().optional().default("other"),
        country: z.string().optional(),
      }),
      execute: async (args) => {
        const { data, error } = await supabase
          .from("champions")
          .insert({
            user_id: userId,
            ...args,
            status: "listening",
          })
          .select()
          .single()

        if (error) return { error: error.message }
        return { champion: data, message: `Champion ${args.name} creado` }
      },
    }),

    update_champion: tool({
      description: "Actualizar datos de un champion (status, email, empresa, rol, notas)",
      parameters: z.object({
        champion_id: z.string().describe("UUID del champion"),
        status: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        const { champion_id, ...updates } = args
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        )

        const { data, error } = await supabase
          .from("champions")
          .update(cleanUpdates)
          .eq("id", champion_id)
          .eq("user_id", userId)
          .select()
          .single()

        if (error) return { error: error.message }
        return { champion: data, message: "Champion actualizado" }
      },
    }),

    list_pending_messages: tool({
      description: "Ver cola de mensajes pendientes (outreach listo para enviar o revisar)",
      parameters: z.object({
        status: z.enum(["pending_review", "approved", "sent", "failed"]).optional(),
        limit: z.number().optional().default(20),
      }),
      execute: async (args) => {
        let query = supabase
          .from("outreach_queue")
          .select("id, champion_id, channel, message, subject_line, status, created_at, champions(name, company)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(args.limit || 20)

        if (args.status) query = query.eq("status", args.status)

        const { data, error } = await query
        if (error) return { error: error.message }
        return { messages: data, count: data?.length || 0 }
      },
    }),

    generate_message: tool({
      description: "Generar un mensaje personalizado con la voz de Gastón para un champion. Devuelve un borrador.",
      parameters: z.object({
        champion_id: z.string().describe("UUID del champion"),
        channel: z.enum(["email", "linkedin"]).describe("Canal de envío"),
        context: z.string().optional().describe("Contexto extra (ej: 'follow up about credits')"),
      }),
      execute: async (args) => {
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
      },
    }),

    send_message: tool({
      description: "Encolar un mensaje para envío por email o LinkedIn. Se crea con status pending_review para que el usuario lo apruebe.",
      parameters: z.object({
        champion_id: z.string().describe("UUID del champion"),
        channel: z.enum(["email", "linkedin"]),
        message: z.string().describe("Cuerpo del mensaje"),
        subject_line: z.string().optional().describe("Asunto del email"),
      }),
      execute: async (args) => {
        const { data, error } = await supabase
          .from("outreach_queue")
          .insert({
            user_id: userId,
            champion_id: args.champion_id,
            channel: args.channel,
            message: args.message,
            subject_line: args.subject_line || null,
            status: "pending_review",
          })
          .select()
          .single()

        if (error) return { error: error.message }
        return { queued: data, message: "Mensaje encolado para revisión" }
      },
    }),

    get_interactions: tool({
      description: "Obtener historial de interacciones con un champion",
      parameters: z.object({
        champion_id: z.string().describe("UUID del champion"),
        limit: z.number().optional().default(20),
      }),
      execute: async (args) => {
        const { data, error } = await supabase
          .from("interactions")
          .select("id, channel, message, reply_content, reply_sentiment, outcome, created_at, reply_received_at")
          .eq("champion_id", args.champion_id)
          .order("created_at", { ascending: false })
          .limit(args.limit || 20)

        if (error) return { error: error.message }
        return { interactions: data, count: data?.length || 0 }
      },
    }),

    list_efemerides: tool({
      description: "Listar efemérides (eventos de marketing/fechas comerciales)",
      parameters: z.object({
        active_only: z.boolean().optional().default(false),
      }),
      execute: async (args) => {
        let query = supabase
          .from("efemerides")
          .select("id, name, description, event_date, industries, countries, is_active")
          .eq("user_id", userId)
          .order("event_date", { ascending: true })

        if (args.active_only) query = query.eq("is_active", true)

        const { data, error } = await query
        if (error) return { error: error.message }
        return { efemerides: data }
      },
    }),

    create_efemeride: tool({
      description: "Crear una nueva efeméride (evento de marketing). Ej: Hot Sale, Black Friday, Cyber Monday.",
      parameters: z.object({
        name: z.string().describe("Nombre del evento"),
        description: z.string().optional(),
        event_date: z.string().describe("Fecha del evento (YYYY-MM-DD)"),
        countries: z.array(z.string()).optional().default(["AR"]).describe("Países (códigos ISO: AR, MX, CO, CL, PE, BR, US)"),
        industries: z.array(z.string()).optional().default([]).describe("Industrias/sectores"),
        reminder_days_before: z.number().optional().default(30),
      }),
      execute: async (args) => {
        const { data, error } = await supabase
          .from("efemerides")
          .insert({
            user_id: userId,
            name: args.name,
            description: args.description || null,
            event_date: args.event_date,
            countries: args.countries,
            industries: args.industries,
            reminder_days_before: args.reminder_days_before,
            is_active: true,
          })
          .select()
          .single()

        if (error) return { error: error.message }
        return { efemeride: data, message: `Efeméride "${args.name}" creada para ${args.event_date}` }
      },
    }),

    get_pipeline_stats: tool({
      description: "Obtener estadísticas del pipeline de ventas (cantidad de champions por status)",
      parameters: z.object({}),
      execute: async () => {
        const { data: champions } = await supabase
          .from("champions")
          .select("status")
          .eq("user_id", userId)

        const stats: Record<string, number> = {
          total: champions?.length || 0,
          listening: 0, trigger_detected: 0, contacted: 0,
          responded: 0, opportunity: 0, paused: 0, rejected: 0,
        }

        champions?.forEach((c) => {
          const s = c.status as string
          if (s in stats) stats[s]++
        })

        return { stats }
      },
    }),

    analyze_performance: tool({
      description: "Analizar rendimiento de los mensajes enviados: tasa de respuesta, sentimiento, canales más efectivos",
      parameters: z.object({
        days: z.number().optional().default(30).describe("Últimos N días a analizar"),
      }),
      execute: async (args) => {
        const since = new Date(Date.now() - args.days * 86400000).toISOString()

        const { data: interactions } = await supabase
          .from("interactions")
          .select("channel, outcome, reply_sentiment, created_at")
          .gte("created_at", since)

        if (!interactions?.length) return { message: "No hay interacciones en el período" }

        const total = interactions.length
        const responded = interactions.filter(i => i.outcome === "responded").length
        const byChannel: Record<string, { sent: number; responded: number }> = {}
        const bySentiment: Record<string, number> = {}

        interactions.forEach(i => {
          const ch = i.channel || "unknown"
          if (!byChannel[ch]) byChannel[ch] = { sent: 0, responded: 0 }
          byChannel[ch].sent++
          if (i.outcome === "responded") byChannel[ch].responded++
          if (i.reply_sentiment) {
            bySentiment[i.reply_sentiment] = (bySentiment[i.reply_sentiment] || 0) + 1
          }
        })

        return {
          period_days: args.days,
          total_sent: total,
          total_responded: responded,
          response_rate: `${Math.round((responded / total) * 100)}%`,
          by_channel: byChannel,
          by_sentiment: bySentiment,
        }
      },
    }),
  }
}
