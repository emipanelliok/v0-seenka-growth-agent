import { createClient } from "@/lib/supabase/server"
import { InteractionsList } from "@/components/interactions/interactions-list"
import type { Interaction, Champion, Trigger } from "@/lib/types"

interface InteractionWithDetails extends Interaction {
  champion: Champion | null
  trigger: Trigger | null
}

export default async function InteractionsPage() {
  const supabase = await createClient()
  
  const { data: interactions, error } = await supabase
    .from("interactions")
    .select(`
      *,
      champion:champions(*),
      trigger:triggers(*)
    `)
    .order("created_at", { ascending: false })

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Interacciones</h1>
        <p className="text-muted-foreground">
          Historial de todos los contactos realizados con champions
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive">
          Error al cargar interacciones: {error.message}
        </div>
      )}

      <InteractionsList interactions={(interactions || []) as InteractionWithDetails[]} />
    </div>
  )
}
