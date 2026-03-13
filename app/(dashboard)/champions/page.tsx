import { createClient } from "@/lib/supabase/server"
import { ChampionsList } from "@/components/champions/champions-list"
import { AddChampionButton } from "@/components/champions/add-champion-button"
import type { Champion } from "@/lib/types"

export default async function ChampionsPage() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("champions")
    .select("*")
    .order("created_at", { ascending: false })

  const champions = (data || []) as Champion[]

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Champions</h1>
          <p className="text-muted-foreground">
            Gestiona tus contactos clave y monitorea su actividad
          </p>
        </div>
        <AddChampionButton />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive">
          Error al cargar champions: {error.message}
        </div>
      )}

      <ChampionsList champions={champions} />
    </div>
  )
}
