import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

// Lightweight endpoint that returns counts for polling
// Used by conversations view to detect new messages without full page reload
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [interactions, queue] = await Promise.all([
      admin.from("interactions").select("id", { count: "exact", head: true }),
      admin.from("outreach_queue").select("id", { count: "exact", head: true })
        .in("status", ["pending_review", "approved"]),
    ])

    return NextResponse.json({
      interactionCount: interactions.count || 0,
      queueCount: queue.count || 0,
    })
  } catch {
    return NextResponse.json({ error: "Poll error" }, { status: 500 })
  }
}
