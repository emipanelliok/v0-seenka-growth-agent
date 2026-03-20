import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { champion_id, message, subject_line, channel } = await request.json()

    if (!champion_id || !message || !channel) {
      return NextResponse.json({ error: "champion_id, message y channel son requeridos" }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get champion info
    const { data: champ } = await admin
      .from("champions")
      .select("id, name, company, email, linkedin_url")
      .eq("id", champion_id)
      .single()

    if (!champ) return NextResponse.json({ error: "Champion no encontrado" }, { status: 404 })

    // Send based on channel
    if (channel === "email") {
      if (!champ.email) return NextResponse.json({ error: "Champion sin email" }, { status: 400 })

      const { data: settings } = await supabase
        .from("settings")
        .select("key, value")
        .eq("user_id", user.id)

      const settingsMap: Record<string, string> = {}
      settings?.forEach((s) => { if (s.value) settingsMap[s.key] = s.value })

      const resendFromDomain = process.env.RESEND_FROM_DOMAIN
      const fromName = settingsMap["outreach_from_name"] || "Seenka"
      const fromEmail = settingsMap["outreach_from_email"] || (resendFromDomain ? `contacto@${resendFromDomain}` : "contacto@aiwknd.com")
      const fromAddress = resendFromDomain
        ? `${fromName} <${fromEmail}>`
        : `${fromName} <onboarding@resend.dev>`

      const subjectLine = subject_line || `Seguimiento - ${champ.company || champ.name}`

      const paragraphs = message.split(/\n\n+/).filter((p: string) => p.trim())
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222; max-width: 560px;">
        ${paragraphs.map((p: string) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`).join("")}
      </div>`

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
          text: message,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return NextResponse.json({ error: `Email falló: ${data.message || res.status}` }, { status: 500 })
      }

    } else if (channel === "linkedin") {
      if (!champ.linkedin_url) return NextResponse.json({ error: "Champion sin LinkedIn URL" }, { status: 400 })

      const unipileDsn = process.env.UNIPILE_DSN
      const unipileToken = process.env.UNIPILE_API_TOKEN
      const accountId = process.env.UNIPILE_LINKEDIN_ACCOUNT_ID

      if (!unipileDsn || !unipileToken || !accountId) {
        return NextResponse.json({ error: "Unipile no configurado — faltan UNIPILE_DSN, UNIPILE_API_TOKEN o UNIPILE_LINKEDIN_ACCOUNT_ID" }, { status: 500 })
      }

      // Clean slug: remove trailing slashes
      const slugMatch = champ.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/)
      if (!slugMatch) return NextResponse.json({ error: `LinkedIn URL inválida: ${champ.linkedin_url}` }, { status: 400 })

      const slug = slugMatch[1].replace(/\/+$/, "")

      // Debug: log exact values to catch whitespace/newline issues
      const cleanDsn = unipileDsn.trim()
      const cleanToken = unipileToken.trim()
      const cleanAccountId = accountId.trim()

      const lookupUrl = `https://${cleanDsn}/api/v1/users/${slug}?account_id=${cleanAccountId}`
      console.log("[send-direct] LinkedIn lookup URL:", lookupUrl)
      console.log("[send-direct] DSN length:", unipileDsn.length, "clean:", cleanDsn.length)
      console.log("[send-direct] AccountID length:", accountId.length, "clean:", cleanAccountId.length)
      console.log("[send-direct] Token length:", unipileToken.length, "clean:", cleanToken.length)

      // Get provider_id
      const userRes = await fetch(lookupUrl, {
        headers: { "X-API-KEY": cleanToken, "accept": "application/json" },
      })

      if (!userRes.ok) {
        const errBody = await userRes.text().catch(() => "")
        console.error("[send-direct] Unipile user lookup failed:", userRes.status, errBody)
        return NextResponse.json({
          error: `No se pudo encontrar el perfil de LinkedIn (slug: ${slug}, status: ${userRes.status})`,
          details: errBody
        }, { status: 400 })
      }

      const userData = await userRes.json()
      const providerId = userData.provider_id || userData.id
      console.log("[send-direct] Unipile provider_id:", providerId)

      if (!providerId) {
        return NextResponse.json({ error: `Unipile no devolvió provider_id para ${slug}` }, { status: 400 })
      }

      // Send message
      const formData = new FormData()
      formData.append("account_id", cleanAccountId)
      formData.append("attendees_ids", providerId)
      formData.append("text", message)

      const sendRes = await fetch(`https://${unipileDsn}/api/v1/chats`, {
        method: "POST",
        headers: { "X-API-KEY": unipileToken, "accept": "application/json" },
        body: formData,
      })

      if (!sendRes.ok) {
        const err = await sendRes.text().catch(() => "")
        console.error("[send-direct] Unipile send failed:", sendRes.status, err)
        return NextResponse.json({ error: `LinkedIn falló (${sendRes.status}): ${err}` }, { status: 500 })
      }

      console.log("[send-direct] LinkedIn message sent to", champ.name, "via slug:", slug)
    }

    // Log interaction
    await admin.from("interactions").insert({
      champion_id,
      channel,
      message,
      sent_at: new Date().toISOString(),
      outcome: "sent",
    })

    // Update champion status
    await admin.from("champions").update({ status: "contacted" }).eq("id", champion_id)

    return NextResponse.json({ success: true, channel, champion: champ.name })

  } catch (error) {
    console.error("[send-direct] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
