import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    // Get user settings
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .eq("user_id", user.id)

    const settingsMap: Record<string, string> = {}
    settings?.forEach((s) => { if (s.value) settingsMap[s.key] = s.value })

    const phantombusterApiKey = settingsMap["phantombuster_api_key"]
    const phantombusterPhantomId = settingsMap["phantombuster_phantom_id"]
    const linkedinSessionCookie = settingsMap["linkedin_session_cookie"]
    const webhookUrl = settingsMap["make_webhook_url"]
    const hasPhantombuster = !!(phantombusterApiKey && phantombusterPhantomId && linkedinSessionCookie)
    const hasResend = !!process.env.RESEND_API_KEY
    const resendFromDomain = process.env.RESEND_FROM_DOMAIN

    // Get all approved items
    const { data: approvedItems } = await supabase
      .from("outreach_queue")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("created_at", { ascending: true })

    if (!approvedItems || approvedItems.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "No hay mensajes aprobados para enviar." })
    }

    // Load champion info for all items
    const championIds = [...new Set(approvedItems.map((i) => i.champion_id))]
    const { data: champions } = await supabase
      .from("champions")
      .select("id, name, company, role, email, linkedin_url, industry, country")
      .in("id", championIds)

    const champMap = new Map((champions || []).map((c) => [c.id, c]))

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const item of approvedItems) {
      const champ = champMap.get(item.champion_id)
      if (!champ) {
        await supabase.from("outreach_queue").update({ status: "failed", error_message: "Champion no encontrado" }).eq("id", item.id)
        failed++
        continue
      }

      // Mark as sending
      await supabase.from("outreach_queue").update({ status: "sending" }).eq("id", item.id)

      try {
        if (item.channel === "email") {
          await sendEmail(champ, item, settingsMap, hasResend, resendFromDomain)
        } else if (item.channel === "linkedin") {
          await sendLinkedIn(champ, item, hasPhantombuster, phantombusterApiKey, phantombusterPhantomId, linkedinSessionCookie, webhookUrl)
        }

        // Mark as sent
        await supabase.from("outreach_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", item.id)

        // Log interaction
        await supabase.from("interactions").insert({
          champion_id: champ.id,
          trigger_id: null,
          channel: item.channel === "email" ? "email" : "linkedin",
          message: item.message,
          insight: item.seenka_data_used || null,
          sent_at: new Date().toISOString(),
          outcome: "sent",
        })

        // Update champion status
        await supabase.from("champions").update({ status: "contacted" }).eq("id", champ.id)

        sent++

        // Rate limit: wait between sends to avoid being flagged
        if (item.channel === "linkedin") {
          await new Promise((r) => setTimeout(r, 3000))
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error desconocido"
        await supabase.from("outreach_queue").update({
          status: "failed",
          error_message: errorMsg,
        }).eq("id", item.id)
        errors.push(`${champ.name}: ${errorMsg}`)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      message: `${sent} mensajes enviados${failed > 0 ? `, ${failed} fallaron` : ""}.`,
    })
  } catch (error) {
    console.error("Send-approved error:", error)
    return NextResponse.json({ error: "Error al enviar mensajes aprobados" }, { status: 500 })
  }
}

async function sendEmail(
  champ: { email: string | null; name: string; company: string | null },
  item: { message: string; subject_line: string | null },
  settingsMap: Record<string, string>,
  hasResend: boolean,
  resendFromDomain?: string
) {
  if (!champ.email) throw new Error("Champion sin email")
  if (!hasResend) throw new Error("No hay servicio de email configurado. Agregá RESEND_API_KEY.")

  const subjectLine = item.subject_line || `Oportunidad - datos para ${champ.company || champ.name}`
  const fromName = settingsMap["outreach_from_name"] || "Seenka"
  // Use the full email from settings, or default to contacto@domain
  const fromEmail = settingsMap["outreach_from_email"] || (resendFromDomain ? `contacto@${resendFromDomain}` : "contacto@aiwknd.com")
  
  // If domain is verified, use custom domain; otherwise use Resend's test domain
  const fromAddress = resendFromDomain 
    ? `${fromName} <${fromEmail}>`
    : `${fromName} <onboarding@resend.dev>`

  const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222; max-width: 560px;">${item.message.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>").replace(/^/, "<p>").replace(/$/, "</p>")}</div>`
  
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [champ.email],
      subject: subjectLine,
      html: htmlBody,
      text: item.message,
    }),
  })
  
  if (res.ok) return
  
  const data = await res.json().catch(() => ({}))
  
  // Check if it's a domain verification issue
  if (data.message?.includes("verify") || res.status === 403) {
    throw new Error("Dominio no verificado en Resend. Verifica tu dominio en resend.com para enviar a cualquier destinatario.")
  }
  
  throw new Error(`Resend: ${data.message || res.status}`)
}

async function sendLinkedIn(
  champ: { linkedin_url: string | null; name: string },
  item: { message: string },
  hasPhantombuster: boolean,
  apiKey: string,
  phantomId: string,
  sessionCookie: string,
  webhookUrl?: string
) {
  if (!champ.linkedin_url) throw new Error("Champion sin LinkedIn URL")

  if (hasPhantombuster) {
    const res = await fetch("https://api.phantombuster.com/api/v2/agents/launch", {
      method: "POST",
      headers: {
        "X-Phantombuster-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: phantomId,
        argument: JSON.stringify({
          sessionCookie,
          spreadsheetUrl: champ.linkedin_url,
          message: item.message,
          noDatabase: true,
        }),
      }),
    })

    if (res.status === 429) {
      throw new Error("Phantombuster ocupado. Reintentar en 1-2 minutos.")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(`Phantombuster: ${data.error || data.message || res.status}`)
    }
    return
  }

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        champion: { name: champ.name, linkedin_url: champ.linkedin_url },
        message: { channel: "linkedin", content: item.message },
      }),
    })
    if (!res.ok) throw new Error(`Webhook error: ${res.status}`)
    return
  }

  throw new Error("No hay Phantombuster ni webhook configurado para LinkedIn")
}
