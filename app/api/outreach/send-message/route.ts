import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { champion, trigger, message, insight, channel, product } = await request.json()

    // Get all settings
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .eq("user_id", user.id)

    const settingsMap: Record<string, string> = {}
    settings?.forEach(s => {
      if (s.value) settingsMap[s.key] = s.value
    })

    const webhookUrl = settingsMap["make_webhook_url"]
    const phantombusterApiKey = settingsMap["phantombuster_api_key"]
    const phantombusterPhantomId = settingsMap["phantombuster_phantom_id"]
    const linkedinSessionCookie = settingsMap["linkedin_session_cookie"]

    // Check if we have Phantombuster configured (preferred) or webhook
    const hasPhantombuster = phantombusterApiKey && phantombusterPhantomId && linkedinSessionCookie
    const hasWebhook = !!webhookUrl
    const hasResend = !!process.env.RESEND_API_KEY
    // Custom verified domain for Resend (set this after verifying your domain)
    const resendFromDomain = process.env.RESEND_FROM_DOMAIN // e.g., "seenka.com"

    // Email channel: use Resend
    if (channel === "email") {
      if (!hasResend) {
        return NextResponse.json(
          { error: "No hay servicio de email configurado. Agregá RESEND_API_KEY en las variables de entorno." },
          { status: 400 }
        )
      }
      if (!champion.email) {
        return NextResponse.json(
          { error: "El champion no tiene email cargado." },
          { status: 400 }
        )
      }

      const subjectLine = champion.subject_line || `${trigger?.topic || "Oportunidad"} - datos para ${champion.company || champion.name}`
      const fromName = settingsMap["outreach_from_name"] || "Seenka"
      // Use the full email from settings, or default to contacto@domain
      const fromEmail = settingsMap["outreach_from_email"] || (resendFromDomain ? `contacto@${resendFromDomain}` : "contacto@aiwknd.com")
      
      // If domain is verified, use custom domain; otherwise use Resend's test domain (limited to account owner)
      const fromAddress = resendFromDomain 
        ? `${fromName} <${fromEmail}>`
        : `${fromName} <onboarding@resend.dev>`

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [champion.email],
          subject: subjectLine,
          html: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">${message.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>").replace(/^/, "<p>").replace(/$/, "</p>")}</div>`,
          text: message,
        }),
      })

      if (!resendResponse.ok) {
        const resendData = await resendResponse.json().catch(() => ({}))
        
        // Check if it's a domain verification issue
        if (resendData.message?.includes("verify") || resendData.statusCode === 403) {
          return NextResponse.json(
            { error: "Dominio no verificado en Resend. Solo podes enviar emails a tu propia cuenta. Verifica tu dominio en resend.com para enviar a cualquier destinatario." },
            { status: 400 }
          )
        }
        
        return NextResponse.json(
          { error: `Error al enviar email: ${resendData.message || resendResponse.status}` },
          { status: 400 }
        )
      }

      // Log the interaction
      await supabase.from("interactions").insert({
        champion_id: champion.id,
        trigger_id: trigger?.id || null,
        channel: "email",
        message: message,
        insight: insight,
        sent_at: new Date().toISOString(),
        outcome: "sent",
      })

      await supabase.from("champions").update({ status: "contacted" }).eq("id", champion.id)

      return NextResponse.json({
        success: true,
        message: `Email enviado a ${champion.email}`,
      })
    }

    if (!hasPhantombuster && !hasWebhook) {
      return NextResponse.json(
        { error: "No hay integración configurada. Andá a Ajustes para configurar Phantombuster o Make." },
        { status: 400 }
      )
    }

    // If we have Phantombuster, use it directly for LinkedIn messages
    if (hasPhantombuster && channel === "linkedin" && champion.linkedin_url) {
      // Phantombuster expects the argument as a JSON string
      const phantomArgument = JSON.stringify({
        sessionCookie: linkedinSessionCookie,
        spreadsheetUrl: champion.linkedin_url,
        message: message,
        noDatabase: true
      })
      
      const phantomResponse = await fetch("https://api.phantombuster.com/api/v2/agents/launch", {
        method: "POST",
        headers: {
          "X-Phantombuster-Key": phantombusterApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: phantombusterPhantomId,
          argument: phantomArgument
        })
      })

      const phantomData = await phantomResponse.json().catch(() => ({}))
      
      if (!phantomResponse.ok) {
        
        // Handle rate limit error with a friendly message
        if (phantomResponse.status === 429 || phantomData.details?.detailedErrorSlug === "maxParallelismReached") {
          return NextResponse.json(
            { error: "Phantombuster está ocupado con otro envío. Esperá 1-2 minutos y probá de nuevo." },
            { status: 429 }
          )
        }
        
        return NextResponse.json(
          { error: `Error de Phantombuster: ${phantomData.error || phantomData.message || phantomResponse.status}` },
          { status: 400 }
        )
      }

      // Also send to webhook if configured (for tracking/logging)
      if (hasWebhook) {
        await sendToWebhook(webhookUrl, champion, trigger, message, insight, channel, product)
      }
    } else if (hasWebhook) {
      // Fallback to webhook only
      const webhookResult = await sendToWebhook(webhookUrl, champion, trigger, message, insight, channel, product)
      if (!webhookResult.ok) {
        return NextResponse.json(
          { error: `Error del webhook: ${webhookResult.status}` },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: "Phantombuster no está configurado y no hay webhook de respaldo." },
        { status: 400 }
      )
    }

    // Log the interaction
    const { error: interactionError } = await supabase
      .from("interactions")
      .insert({
        champion_id: champion.id,
        trigger_id: trigger?.id || null,
        channel: channel,
        message: message,
        insight: insight,
        sent_at: new Date().toISOString(),
        outcome: "sent"
      })

    if (interactionError) {
      console.error("Error logging interaction:", interactionError)
    }

    // Update champion status
    await supabase
      .from("champions")
      .update({ status: "contacted" })
      .eq("id", champion.id)

    return NextResponse.json({ 
      success: true,
      message: hasPhantombuster 
        ? "Mensaje enviado a Phantombuster - LinkedIn lo enviará en breve"
        : "Mensaje enviado al webhook correctamente"
    })
  } catch (error) {
    console.error("Error sending message:", error)
    return NextResponse.json(
      { error: "Error al enviar mensaje" },
      { status: 500 }
    )
  }
}

async function sendToWebhook(
  webhookUrl: string,
  champion: any,
  trigger: any,
  message: string,
  insight: string,
  channel: string,
  product: string
) {
  const payload = {
    timestamp: new Date().toISOString(),
    champion: {
      id: champion.id,
      name: champion.name,
      company: champion.company,
      role: champion.role,
      linkedin_url: champion.linkedin_url,
      industry: champion.industry,
      country: champion.country
    },
    trigger: trigger ? {
      id: trigger.id,
      type: trigger.type,
      topic: trigger.topic,
      source_text: trigger.source_text?.substring(0, 500),
      severity: trigger.severity
    } : null,
    message: {
      channel: channel,
      content: message,
      insight: insight,
      recommended_product: product
    }
  }

  return fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
}
