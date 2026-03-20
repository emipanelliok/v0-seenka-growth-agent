import { createClient } from "@/lib/supabase/server"
import { ConversationsView } from "@/components/interactions/conversations-view"

export default async function InteractionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Load all interactions (ascending so thread is in order)
  const { data: interactions } = await supabase
    .from("interactions")
    .select("id, champion_id, message, response, reply_content, reply_sentiment, outcome, channel, insight, created_at")
    .order("created_at", { ascending: true })

  // Load pending/approved outreach queue items (no user_id filter — webhook creates without user_id)
  const { data: queueItems } = await supabase
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
    ? await supabase
        .from("champions")
        .select("id, name, company, role, email, linkedin_url")
        .in("id", [...champIds])
    : { data: [] }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <ConversationsView
        interactions={interactions || []}
        queueItems={queueItems || []}
        champions={champions || []}
      />
    </div>
  )
}
