import { createClient } from "@/lib/supabase/server"
import { TriggersList } from "@/components/triggers/triggers-list"
import { AddTriggerButton } from "@/components/triggers/add-trigger-button"
import type { Trigger, Champion } from "@/lib/types"

interface TriggerWithChampion extends Trigger {
  champion: Champion | null
}

export default async function TriggersPage() {
  const supabase = await createClient()
  
  const { data: triggers, error } = await supabase
    .from("triggers")
    .select(`
      *,
      champion:champions(*)
    `)
    .order("created_at", { ascending: false })

  const { data: champions } = await supabase
    .from("champions")
    .select("id, name, company, industry")
    .order("name")

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Triggers</h1>
          <p className="text-muted-foreground">
            Detecta y evalúa oportunidades de contacto con IA
          </p>
        </div>
        <AddTriggerButton champions={champions || []} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive">
          Error al cargar triggers: {error.message}
        </div>
      )}

      <TriggersList triggers={(triggers || []) as TriggerWithChampion[]} />
    </div>
  )
}
