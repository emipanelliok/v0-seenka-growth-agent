import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { EfemerideOutreach } from "@/components/efemerides/efemeride-outreach"

export default async function EfemerideOutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  // Load efemeride - EXPLICITLY include manual_data
  const { data: efemeride } = await supabase
    .from("efemerides")
    .select("id, user_id, name, description, countries, industries, event_date, reminder_days_before, seenka_data_hint, manual_data, is_active, created_at")
    .eq("id", id)
    .single()

  if (!efemeride) redirect("/efemerides")

  // Load industry data for this efemeride
  const { data: industryData } = await supabase
    .from("efemeride_industry_data")
    .select("*")
    .eq("efemeride_id", id)

  // Load all champions with their clients
  const { data: champions } = await supabase
    .from("champions")
    .select("*")
    .eq("user_id", user.id)
    .order("name")

  const { data: allClients } = await supabase
    .from("champion_clients")
    .select("*")

  // Load interactions to determine stage (cold/warm/reengagement)
  // RLS on interactions is via champion ownership, no user_id column
  const championIds = (champions || []).map((c) => c.id)
  const { data: interactions } = championIds.length > 0
    ? await supabase
        .from("interactions")
        .select("champion_id, channel, created_at")
        .in("champion_id", championIds)
    : { data: [] as { champion_id: string; channel: string; created_at: string }[] }

  return (
    <div className="space-y-6">
      <EfemerideOutreach
        efemeride={efemeride}
        industryData={industryData || []}
        champions={champions || []}
        allClients={allClients || []}
        interactions={interactions || []}
      />
    </div>
  )
}
