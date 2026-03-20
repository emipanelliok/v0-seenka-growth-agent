import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  )

  const { data: queueItems, error } = await supabase
    .from("outreach_queue")
    .select("id, champion_id, message, subject_line, channel, status, created_at, efemeride_id")
    .order("created_at", { ascending: false })
    .limit(20)

  return NextResponse.json({
    error,
    count: queueItems?.length || 0,
    items: queueItems?.map(q => ({
      id: q.id,
      champion_id: q.champion_id,
      status: q.status,
      channel: q.channel,
      created_at: q.created_at,
      message_preview: q.message?.substring(0, 80)
    }))
  })
}
