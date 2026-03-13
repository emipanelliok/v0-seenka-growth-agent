import { createClient } from "@/lib/supabase/server"
import { EfemeridesView } from "@/components/efemerides/efemerides-view"
import type { Efemeride } from "@/lib/types"

export default async function EfemeridesPage() {
  const supabase = await createClient()

  const { data: efemerides, error } = await supabase
    .from("efemerides")
    .select("*")
    .order("event_date", { ascending: true })

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Efemérides</h1>
        <p className="text-muted-foreground">
          Fechas comerciales y de marketing para generar mensajes con contexto relevante
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive">
          Error al cargar efemérides: {error.message}
        </div>
      )}

      <EfemeridesView efemerides={(efemerides || []) as Efemeride[]} />
    </div>
  )
}
