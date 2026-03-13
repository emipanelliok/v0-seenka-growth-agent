import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { generateText } from "ai"
import { buildOutreachCandidates } from "@/lib/outreach-matching"
import { getSeenkaDataForBrand, getSeenkaDataForSector } from "@/lib/seenka-mcp"

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { efemeride_id } = await request.json()
    if (!efemeride_id) {
      return NextResponse.json({ error: "efemeride_id requerido" }, { status: 400 })
    }

    // Load efemeride
    const { data: efemeride } = await supabase
      .from("efemerides")
      .select("*")
      .eq("id", efemeride_id)
      .single()

    if (!efemeride) {
      return NextResponse.json({ error: "Efeméride no encontrada" }, { status: 404 })
    }

    // Load industry data, champions, clients, interactions in parallel
    const [
      { data: industryData },
      { data: champions },
    ] = await Promise.all([
      supabase.from("efemeride_industry_data").select("*").eq("efemeride_id", efemeride_id),
      supabase.from("champions").select("*").eq("user_id", user.id),
    ])

    if (!champions || champions.length === 0) {
      return NextResponse.json({ error: "No hay champions cargados" }, { status: 400 })
    }

    const championIds = champions.map((c) => c.id)

    const [
      { data: allClients },
      { data: interactions },
      { data: existingQueued },
    ] = await Promise.all([
      supabase.from("champion_clients").select("*").in("champion_id", championIds),
      supabase.from("interactions").select("champion_id, channel, created_at").in("champion_id", championIds),
      supabase.from("outreach_queue").select("champion_id").eq("efemeride_id", efemeride_id).in("status", ["pending_review", "approved", "sending", "sent"]),
    ])

    const alreadyQueuedIds = new Set((existingQueued || []).map((q) => q.champion_id))

    // Match champions and filter already queued
    const candidates = buildOutreachCandidates(
      champions,
      allClients || [],
      interactions || [],
      efemeride,
      industryData || []
    ).filter((c) => !alreadyQueuedIds.has(c.champion.id))

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        message: "No hay champions nuevos para esta efeméride (ya fueron encolados o no matchean).",
      })
    }

    // Days until event
    const eventDate = new Date(efemeride.event_date + "T00:00:00")
    const daysUntil = Math.ceil(
      (eventDate.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
    )

    let timingContext = ""
    if (daysUntil > 30) timingContext = `Faltan ${daysUntil} días. Planificación temprana.`
    else if (daysUntil > 14) timingContext = `Faltan ${daysUntil} días. Etapa de ejecución.`
    else if (daysUntil > 0) timingContext = `Faltan solo ${daysUntil} días. Último momento.`
    else if (daysUntil === 0) timingContext = "El evento es HOY."
    else timingContext = `El evento fue hace ${Math.abs(daysUntil)} días. Recap post-evento.`

    // Generate messages for each candidate
    let generated = 0
    const errors: string[] = []

    for (const candidate of candidates) {
      try {
        const clientsInfo = candidate.clients.length > 0
          ? candidate.clients.map((c) => {
              const parts = [c.client_name]
              if (c.matched_sector) parts.push(`sector: ${c.matched_sector}`)
              if (c.matched_industria) parts.push(`industria: ${c.matched_industria}`)
              return parts.join(" (") + (parts.length > 1 ? ")" : "")
            }).join(", ")
          : "No tenemos info de qué clientes maneja"

        // Primary client brand to anchor the message personalization
        const primaryClient = candidate.clients.length > 0 ? candidate.clients[0].client_name : null
        const clientBrandsText = candidate.clients.length > 0
          ? candidate.clients.map((c) => c.client_name).join(", ")
          : null

        let stageContext = ""
        switch (candidate.stage) {
          case "cold": stageContext = "Primer contacto, NO nos conoce. Mensaje casual, compartí un dato útil sin vender."; break
          case "warm": stageContext = "Ya tuvimos interacción previa. Podés ser más directo."; break
          case "reengagement": stageContext = "Fue cliente o tuvo demo. Usá la efeméride como excusa para retomar."; break
        }

        const seenkaData = candidate.matchedIndustryData || efemeride.seenka_data_hint || null

        // Try to get real-time Seenka data — first try the primary client brand, then fallback to sector
        let liveSeenkaData: string | null = null
        const championCountry = candidate.champion.country?.toUpperCase().slice(0, 2) || "AR"

        if (primaryClient) {
          liveSeenkaData = await getSeenkaDataForBrand(primaryClient, {
            efemeridesName: efemeride.name,
            country: championCountry,
          })
        }

        // Fallback: if no brand data, try sector-level data from the efemeride industries
        if (!liveSeenkaData && efemeride.industries?.length > 0) {
          const countryMap: Record<string, string> = {
            AR: "argentina", MX: "mexico", CO: "colombia", CL: "chile", PE: "peru", BR: "brasil",
          }
          liveSeenkaData = await getSeenkaDataForSector(
            efemeride.industries[0],
            countryMap[championCountry] || "argentina"
          )
        }

        const effectiveSeenkaData = liveSeenkaData || seenkaData
        const seenkaContext = effectiveSeenkaData
          ? `DATO SEENKA (datos reales — usalo como gancho, personalizalo con las marcas del champion):\n${effectiveSeenkaData}`
          : "NO hay datos de Seenka disponibles. Generá un mensaje contextual útil sin inventar estadísticas."

        const personalizationInstruction = primaryClient
          ? `PERSONALIZACIÓN OBLIGATORIA: El mensaje DEBE mencionar "${primaryClient}" (o alguna de estas marcas: ${clientBrandsText}) de forma específica. No mandes el mismo mensaje genérico que le mandarías a cualquiera. El gancho es "vi datos de ${primaryClient} en particular", no "vi datos de la industria en general".`
          : "No tenemos marcas específicas del champion, usá el dato de industria general."

        const channelConstraints = candidate.channel === "email"
          ? `FORMATO: Email. Seguí este esquema EXACTO, respetando los saltos de línea:

Subject: [Incluí el nombre de una de las marcas/clientes que maneja la persona. Máximo 8 palabras. Ejemplo: "Datos de Peugeot en streaming este verano"]

Hola [Nombre],

¿Cómo estás?

[Párrafo 1: arrancá con el dato concreto. Ejemplo: "Estaba viendo unos datos y vi que en streaming casi todo el inventario automotriz está en formato PNT..."]

[Párrafo 2: contexto de la tendencia, máximo 2 oraciones.]

[CTA: una sola pregunta natural. Ejemplo: "¿Te mando los datos de Peugeot en particular?"]

[nombre]

REGLAS: tuteo argentino (voseo), sin emojis, sin bullets, sin asteriscos, sin markdown. Reemplazá [Nombre] con el nombre real de la persona.`
          : `FORMATO: LinkedIn DM. Seguí este esquema EXACTO:

Hola [Nombre], ¿cómo estás? [1 oración con el dato concreto referido a una de sus marcas/clientes.] [1 pregunta natural de cierre. Ejemplo: "¿Te mando más datos?"]

REGLAS: máximo 300 caracteres en total, tuteo argentino (voseo), sin emojis, sin markdown. Reemplazá [Nombre] con el nombre real de la persona.`

        const prompt = `Sos una persona que trabaja en inteligencia publicitaria y le estás escribiendo a un colega de la industria. NO sos un vendedor, no estás vendiendo nada. Simplemente compartís algo que encontraste y que creés que le puede servir.

Seenka es una plataforma de monitoreo publicitario. Pero ESO no lo mencionés hasta que sea absolutamente natural hacerlo. El foco es el dato, no el producto.

CONTEXTO DE LA SITUACIÓN:
Efeméride: ${efemeride.name}
Descripción: ${efemeride.description || ""}
Fecha: ${efemeride.event_date}
${timingContext}

PERSONA:
Nombre: ${candidate.champion.name}
Cargo: ${candidate.champion.role || ""}
Empresa: ${candidate.champion.company || ""}
País: ${candidate.champion.country || ""}
Tipo de rol: ${candidate.champion.champion_type || ""}
Clientes que maneja: ${clientsInfo}

RELACIÓN ACTUAL: ${candidate.stage}
${stageContext}

${personalizationInstruction}

${seenkaContext}

${channelConstraints}

TONO Y ESTILO — esto es lo más importante:
- Escribí como le escribirías a alguien que conocés un poco pero no íntimamente. El tono de "hey, vi esto y me acordé de vos"
- Nada de estructura corporativa: sin "espero que estés bien", sin "me dirijo a vos para...", sin "te escribo porque"
- El mensaje tiene que parecer espontáneo, como si hubieras visto algo y se lo mandás
- Si hay dato de Seenka, tiralo directo sin rodeos: "vi que X marca invirtió un 40% más en digital este año"
- No expliques qué es Seenka, no describas qué hace tu plataforma
- No uses frases de vendedor: "quisiera saber si...", "estaría bueno poder...", "me gustaría ofrecerte..."
- Cerrá con UNA sola pregunta corta y natural, no con un call to action de ventas
- Máximo 3 oraciones para LinkedIn/WhatsApp. Para email: corto, directo, que se lea en 20 segundos.

REGLAS DURAS:
- Español argentino con voseo
- Sin emojis
- Sin firmas elaboradas
- No inventés datos si no tenés el dato Seenka
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
        if (candidate.channel === "email") {
          const subjectMatch = message.match(/^(?:Subject|Asunto):\s*(.+?)(?:\n|$)/i)
          if (subjectMatch) {
            subjectLine = subjectMatch[1].trim()
            // Remove subject line and any blank line after it
            message = message.replace(/^(?:Subject|Asunto):\s*.+\n{1,2}/i, "").trim()
          }
        }

        await supabase.from("outreach_queue").insert({
          user_id: user.id,
          efemeride_id: efemeride.id,
          champion_id: candidate.champion.id,
          channel: candidate.channel,
          stage: candidate.stage,
          message,
          subject_line: subjectLine,
          seenka_data_used: effectiveSeenkaData,
          status: "pending_review",
        })

        generated++
      } catch (err) {
        errors.push(`${candidate.champion.name}: ${err instanceof Error ? err.message : "Error"}`)
      }
    }

    return NextResponse.json({
      success: true,
      generated,
      total_candidates: candidates.length + (existingQueued?.length || 0),
      skipped: existingQueued?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `${generated} mensajes generados y pendientes de aprobación.`,
    })
  } catch (error) {
    console.error("Auto-generate error:", error)
    return NextResponse.json(
      { error: "Error al auto-generar outreach" },
      { status: 500 }
    )
  }
}
