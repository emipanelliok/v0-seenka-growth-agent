"use server"

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// This endpoint sends message data to a configured webhook
// Compatible with: Zapier, Make, n8n, Phantombuster, or any custom endpoint
export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { 
    champion_id,
    champion_name,
    champion_linkedin_url,
    champion_email,
    message,
    channel,
    trigger_id,
    insight,
  } = body

  // Get webhook URL from environment variable
  const webhookUrl = process.env.OUTREACH_WEBHOOK_URL

  if (!webhookUrl) {
    // No webhook configured - just save the interaction
    const { data: interaction, error } = await supabase.from("interactions").insert({
      champion_id,
      trigger_id,
      channel,
      message,
      insight,
      outcome: "sent",
      sent_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update champion status
    await supabase
      .from("champions")
      .update({ status: "contacted" })
      .eq("id", champion_id)

    return NextResponse.json({ 
      success: true, 
      interaction,
      webhook_sent: false,
      message: "Interacción guardada. Configura OUTREACH_WEBHOOK_URL para automatizar el envío."
    })
  }

  // Prepare webhook payload
  const webhookPayload = {
    // Standard fields for most automation tools
    linkedin_url: champion_linkedin_url,
    email: champion_email,
    name: champion_name,
    message: message,
    channel: channel,
    
    // Additional context
    trigger_id,
    champion_id,
    insight,
    timestamp: new Date().toISOString(),
    
    // Metadata for routing in automation tools
    source: "seenka_growth_agent",
  }

  try {
    // Send to webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add custom header for authentication if needed
        ...(process.env.OUTREACH_WEBHOOK_SECRET && {
          "X-Webhook-Secret": process.env.OUTREACH_WEBHOOK_SECRET
        })
      },
      body: JSON.stringify(webhookPayload),
    })

    const webhookSuccess = webhookResponse.ok

    // Save the interaction
    const { data: interaction, error } = await supabase.from("interactions").insert({
      champion_id,
      trigger_id,
      channel,
      message,
      insight,
      outcome: webhookSuccess ? "sent" : "sent", // Mark as sent either way
      sent_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update champion status
    await supabase
      .from("champions")
      .update({ status: "contacted" })
      .eq("id", champion_id)

    return NextResponse.json({ 
      success: true, 
      interaction,
      webhook_sent: webhookSuccess,
      webhook_status: webhookResponse.status,
    })

  } catch (webhookError) {
    console.error("Webhook error:", webhookError)
    
    // Still save the interaction even if webhook fails
    const { data: interaction } = await supabase.from("interactions").insert({
      champion_id,
      trigger_id,
      channel,
      message,
      insight,
      outcome: "sent",
      sent_at: new Date().toISOString(),
    }).select().single()

    await supabase
      .from("champions")
      .update({ status: "contacted" })
      .eq("id", champion_id)

    return NextResponse.json({ 
      success: true, 
      interaction,
      webhook_sent: false,
      webhook_error: "Failed to send to webhook",
    })
  }
}
