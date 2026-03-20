import { NextRequest, NextResponse } from "next/server"
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

// DELETE /api/debug/queue?champion_id=xxx — wipe all data for a champion
export async function DELETE(request: NextRequest) {
  const championId = request.nextUrl.searchParams.get("champion_id")
  if (!championId) return NextResponse.json({ error: "champion_id required" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  )

  const results: Record<string, any> = {}

  const { error: e1, count: c1 } = await supabase
    .from("outreach_queue").delete({ count: "exact" }).eq("champion_id", championId)
  results.outreach_queue = { deleted: c1, error: e1 }

  const { error: e2, count: c2 } = await supabase
    .from("interactions").delete({ count: "exact" }).eq("champion_id", championId)
  results.interactions = { deleted: c2, error: e2 }

  const { error: e3, count: c3 } = await supabase
    .from("champion_sequences").delete({ count: "exact" }).eq("champion_id", championId)
  results.champion_sequences = { deleted: c3, error: e3 }

  // Reset champion status back to "new"
  await supabase.from("champions").update({ status: "new" }).eq("id", championId)

  return NextResponse.json({ champion_id: championId, results })
}
