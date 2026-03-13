import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OutreachQueue } from "@/components/outreach/outreach-queue"

export const metadata = {
  title: "Bandeja de Salida | Seenka Growth Agent",
  description: "Revisá y aprobá mensajes de outreach antes de enviarlos",
}

export default async function OutreachQueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  // Load queue items with champion and efemeride data
  const { data: queueItems } = await supabase
    .from("outreach_queue")
    .select("*")
    .order("created_at", { ascending: false })

  // Load champions for display
  const championIds = [...new Set((queueItems || []).map((q) => q.champion_id))]
  const { data: champions } = championIds.length > 0
    ? await supabase.from("champions").select("id, name, company, role, email, linkedin_url, champion_type, photo_url").in("id", championIds)
    : { data: [] }

  // Load efemerides for display
  const efemerideIds = [...new Set((queueItems || []).filter((q) => q.efemeride_id).map((q) => q.efemeride_id))]
  const { data: efemerides } = efemerideIds.length > 0
    ? await supabase.from("efemerides").select("id, name, event_date").in("id", efemerideIds)
    : { data: [] }

  const championsMap = Object.fromEntries((champions || []).map((c) => [c.id, c]))
  const efemeridesMap = Object.fromEntries((efemerides || []).map((e) => [e.id, e]))

  return (
    <div className="space-y-6">
      <OutreachQueue
        queueItems={queueItems || []}
        championsMap={championsMap}
        efemeridesMap={efemeridesMap}
      />
    </div>
  )
}
