import { createClient } from "@/lib/supabase/server"
import { OutreachQueue } from "@/components/outreach/outreach-queue"

export default async function BandejaPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Load queue with champion and efemeride info
  const { data: queueItems } = await supabase
    .from("outreach_queue")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // Load champion details for each queue item
  const championIds = [...new Set((queueItems || []).map((q) => q.champion_id))]
  const { data: champions } = championIds.length > 0
    ? await supabase.from("champions").select("id, name, company, role, email, linkedin_url, champion_type, country").in("id", championIds)
    : { data: [] }

  // Load efemeride details
  const efemerideIds = [...new Set((queueItems || []).filter((q) => q.efemeride_id).map((q) => q.efemeride_id))]
  const { data: efemerides } = efemerideIds.length > 0
    ? await supabase.from("efemerides").select("id, name, event_date").in("id", efemerideIds)
    : { data: [] }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Bandeja de Salida</h1>
        <p className="text-muted-foreground">
          Revisá, aprobá o rechazá los mensajes antes de enviarlos
        </p>
      </div>
      <OutreachQueue
        items={queueItems || []}
        champions={champions || []}
        efemerides={efemerides || []}
      />
    </div>
  )
}
