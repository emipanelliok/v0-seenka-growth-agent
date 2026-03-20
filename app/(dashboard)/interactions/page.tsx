import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { ConversationsView } from "@/components/interactions/conversations-view"

export default async function InteractionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Admin client bypasses RLS — needed because webhook inserts without user_id
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Load all interactions (ascending so thread is in order)
  const { data: interactions } = await admin
    .from("interactions")
    .select("id, champion_id, message, response, reply_content, reply_sentiment, outcome, channel, insight, created_at, sent_at, reply_received_at")
    .order("created_at", { ascending: true })

  // Load pending/approved outreach queue items
  const { data: queueItems } = await admin
    .from("outreach_queue")
    .select("id, champion_id, message, subject_line, channel, status, created_at, efemeride_id")
    .in("status", ["pending_review", "approved"])
    .order("created_at", { ascending: true })

  // Collect all champion IDs from both sources
  const champIds = new Set([
    ...((interactions || []).map((i) => i.champion_id)),
    ...((queueItems || []).map((q) => q.champion_id)),
  ])

  const { data: champions } = champIds.size > 0
    ? await admin
        .from("champions")
        .select("id, name, company, role, email, linkedin_url")
        .in("id", [...champIds])
    : { data: [] }

  const loadedAt = new Date().toISOString()

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <ConversationsView
        interactions={interactions || []}
        queueItems={queueItems || []}
        champions={champions || []}
        loadedAt={loadedAt}
      />
    </div>
  )
}
