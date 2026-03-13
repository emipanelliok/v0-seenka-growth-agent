"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Champion, ChampionStatus, ChampionLevel } from "@/lib/types"
import { STATUS_LABELS, LEVEL_LABELS } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Search,
  MoreVertical,
  ExternalLink,
  Trash2,
  Edit,
  Zap,
  Users,
  Loader2,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ChampionsListProps {
  champions: Champion[]
}

export function ChampionsList({ champions }: ChampionsListProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const filteredChampions = champions.filter((champion) => {
    const matchesSearch =
      champion.name.toLowerCase().includes(search.toLowerCase()) ||
      champion.company?.toLowerCase().includes(search.toLowerCase()) ||
      champion.role?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === "all" || champion.status === statusFilter

    const matchesLevel =
      levelFilter === "all" || champion.champion_level === levelFilter

    return matchesSearch && matchesStatus && matchesLevel
  })

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)

    const supabase = createClient()
    const { error } = await supabase.from("champions").delete().eq("id", deleteId)

    if (!error) {
      router.refresh()
    }

    setIsDeleting(false)
    setDeleteId(null)
  }

  if (champions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No hay champions</h3>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Comienza agregando tus contactos clave para monitorear su actividad
            y detectar oportunidades de venta.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, empresa o rol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Nivel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredChampions.map((champion) => (
          <ChampionCard
            key={champion.id}
            champion={champion}
            onDelete={() => setDeleteId(champion.id)}
          />
        ))}
      </div>

      {filteredChampions.length === 0 && champions.length > 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No se encontraron champions con los filtros seleccionados
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar champion?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los triggers
              e interacciones asociadas a este champion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ChampionCard({
  champion,
  onDelete,
}: {
  champion: Champion
  onDelete: () => void
}) {
  const statusColors: Record<ChampionStatus, string> = {
    listening: "bg-secondary text-secondary-foreground",
    trigger_detected: "bg-accent/20 text-accent-foreground",
    contacted: "bg-primary/20 text-primary",
    responded: "bg-chart-2/20 text-chart-2",
    opportunity: "bg-chart-3/20 text-chart-3",
    paused: "bg-muted text-muted-foreground",
  }

  const levelColors: Record<ChampionLevel, string> = {
    high: "text-destructive",
    medium: "text-accent",
    low: "text-muted-foreground",
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {champion.name.charAt(0).toUpperCase()}
              </div>
              {/* Enrichment status indicator */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute -right-0.5 -top-0.5">
                      {champion.enrichment_status === "enriching" && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                      )}
                      {champion.enrichment_status === "complete" && (
                        <div className="h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                      )}
                      {champion.enrichment_status === "error" && (
                        <div className="h-3 w-3 rounded-full bg-destructive border-2 border-background" />
                      )}
                      {(champion.enrichment_status === "pending" || !champion.enrichment_status) && (
                        <div className="h-3 w-3 rounded-full bg-muted-foreground/30 border-2 border-background" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {champion.enrichment_status === "enriching" && "Enriqueciendo perfil..."}
                    {champion.enrichment_status === "complete" && "Perfil completo"}
                    {champion.enrichment_status === "error" && `Error: ${champion.enrichment_error || "Error de enriquecimiento"}`}
                    {(champion.enrichment_status === "pending" || !champion.enrichment_status) && "Pendiente de enriquecer"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <CardTitle className="text-base">{champion.name}</CardTitle>
              {champion.role && (
                <CardDescription className="text-xs">
                  {champion.role}
                </CardDescription>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/champions/${champion.id}`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Ver detalles
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/champions/${champion.id}/triggers`}>
                  <Zap className="mr-2 h-4 w-4" />
                  Ver triggers
                </Link>
              </DropdownMenuItem>
              {champion.linkedin_url && (
                <DropdownMenuItem asChild>
                  <a
                    href={champion.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir LinkedIn
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {champion.company && (
          <p className="text-sm text-muted-foreground">{champion.company}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[champion.status]}`}
          >
            {STATUS_LABELS[champion.status]}
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-medium ${levelColors[champion.champion_level]}`}
          >
            <Zap className="h-3 w-3" />
            {LEVEL_LABELS[champion.champion_level]}
          </span>
        </div>
        {(champion.industry || champion.country) && (
          <p className="text-xs text-muted-foreground">
            {[champion.industry, champion.country].filter(Boolean).join(" • ")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
