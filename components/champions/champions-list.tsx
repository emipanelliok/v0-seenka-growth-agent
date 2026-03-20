"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Champion, ChampionStatus, ChampionLevel, ChampionType } from "@/lib/types"
import { STATUS_LABELS, LEVEL_LABELS, CHAMPION_TYPE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Search,
  MoreVertical,
  ExternalLink,
  Trash2,
  Zap,
  Users,
  Loader2,
  Linkedin,
  Mail,
  Building2,
  MapPin,
  LayoutGrid,
  LayoutList,
  Eye,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react"

interface ChampionsListProps {
  champions: Champion[]
}

type SortField = "name" | "company" | "status" | "champion_level" | "created_at"
type SortDir = "asc" | "desc"
type ViewMode = "table" | "grid"

const STATUS_DOT_COLORS: Record<ChampionStatus, string> = {
  listening: "bg-zinc-400",
  trigger_detected: "bg-amber-500",
  contacted: "bg-blue-500",
  responded: "bg-emerald-500",
  opportunity: "bg-purple-500",
  paused: "bg-zinc-300",
}

const LEVEL_COLORS: Record<ChampionLevel, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

const STATUS_BADGE_COLORS: Record<ChampionStatus, string> = {
  listening: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  trigger_detected: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  responded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  opportunity: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  paused: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
}

export function ChampionsList({ champions }: ChampionsListProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const router = useRouter()

  const filteredChampions = champions
    .filter((champion) => {
      const q = search.toLowerCase()
      const matchesSearch =
        champion.name.toLowerCase().includes(q) ||
        champion.company?.toLowerCase().includes(q) ||
        champion.role?.toLowerCase().includes(q) ||
        champion.email?.toLowerCase().includes(q) ||
        champion.industry?.toLowerCase().includes(q)

      const matchesStatus = statusFilter === "all" || champion.status === statusFilter
      const matchesLevel = levelFilter === "all" || champion.champion_level === levelFilter
      const matchesType = typeFilter === "all" || champion.champion_type === typeFilter

      return matchesSearch && matchesStatus && matchesLevel && matchesType
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      const av = (a as any)[sortField] || ""
      const bv = (b as any)[sortField] || ""
      if (sortField === "created_at") {
        return dir * (new Date(av).getTime() - new Date(bv).getTime())
      }
      return dir * String(av).localeCompare(String(bv))
    })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("champions").delete().eq("id", deleteId)
    if (!error) router.refresh()
    setIsDeleting(false)
    setDeleteId(null)
  }

  // Stats
  const stats = {
    total: champions.length,
    opportunity: champions.filter((c) => c.status === "opportunity").length,
    responded: champions.filter((c) => c.status === "responded").length,
    contacted: champions.filter((c) => c.status === "contacted").length,
  }

  if (champions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="mb-2 text-lg font-semibold">No hay champions</h3>
        <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
          Comienza agregando tus contactos clave para monitorear su actividad
          y detectar oportunidades de venta.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Oportunidades" value={stats.opportunity} color="text-purple-600" />
        <StatCard label="Respondieron" value={stats.responded} color="text-emerald-600" />
        <StatCard label="Contactados" value={stats.contacted} color="text-blue-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, empresa, rol, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[155px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[value as ChampionStatus]}`} />
                    {label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Nivel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(CHAMPION_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode("table")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filteredChampions.length} de {champions.length} champions
      </p>

      {/* Table view */}
      {viewMode === "table" && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[280px]">
                  <SortButton field="name" current={sortField} dir={sortDir} onSort={handleSort}>
                    Champion
                  </SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="company" current={sortField} dir={sortDir} onSort={handleSort}>
                    Empresa
                  </SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="status" current={sortField} dir={sortDir} onSort={handleSort}>
                    Estado
                  </SortButton>
                </TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">País</TableHead>
                <TableHead className="hidden xl:table-cell">Contacto</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChampions.map((champion) => (
                <TableRow
                  key={champion.id}
                  className="cursor-pointer group"
                  onClick={() => router.push(`/champions/${champion.id}`)}
                >
                  {/* Champion name + photo + role */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        {champion.photo_url ? (
                          <Image
                            src={champion.photo_url}
                            alt={champion.name}
                            width={40}
                            height={40}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {getInitials(champion.name)}
                          </div>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${STATUS_DOT_COLORS[champion.status]}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">
                          {champion.name}
                        </p>
                        {champion.role && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {champion.role}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Company */}
                  <TableCell>
                    {champion.company ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[150px]">{champion.company}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[champion.status]}`}>
                      {STATUS_LABELS[champion.status]}
                    </span>
                  </TableCell>

                  {/* Level */}
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[champion.champion_level]}`}>
                      <Zap className="h-3 w-3" />
                      {LEVEL_LABELS[champion.champion_level]}
                    </span>
                  </TableCell>

                  {/* Type */}
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {CHAMPION_TYPE_LABELS[champion.champion_type] || champion.champion_type}
                    </span>
                  </TableCell>

                  {/* Country */}
                  <TableCell className="hidden lg:table-cell">
                    {champion.country ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{champion.country}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Contact links */}
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {champion.linkedin_url && (
                        <a
                          href={champion.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-blue-600 transition-colors"
                          title="LinkedIn"
                        >
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                      {champion.email && (
                        <a
                          href={`mailto:${champion.email}`}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={champion.email}
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/champions/${champion.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver perfil
                            </Link>
                          </DropdownMenuItem>
                          {champion.linkedin_url && (
                            <DropdownMenuItem asChild>
                              <a href={champion.linkedin_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                LinkedIn
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(champion.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grid view */}
      {viewMode === "grid" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredChampions.map((champion) => (
            <Link
              key={champion.id}
              href={`/champions/${champion.id}`}
              className="group block"
            >
              <div className="rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    {champion.photo_url ? (
                      <Image
                        src={champion.photo_url}
                        alt={champion.name}
                        width={48}
                        height={48}
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {getInitials(champion.name)}
                      </div>
                    )}
                    <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${STATUS_DOT_COLORS[champion.status]}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate group-hover:text-primary transition-colors">
                      {champion.name}
                    </p>
                    {champion.role && (
                      <p className="text-xs text-muted-foreground truncate">{champion.role}</p>
                    )}
                    {champion.company && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {champion.company}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_COLORS[champion.status]}`}>
                    {STATUS_LABELS[champion.status]}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_COLORS[champion.champion_level]}`}>
                    <Zap className="h-2.5 w-2.5" />
                    {LEVEL_LABELS[champion.champion_level]}
                  </span>
                  {champion.champion_type && champion.champion_type !== "other" && (
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {CHAMPION_TYPE_LABELS[champion.champion_type]}
                    </span>
                  )}
                </div>

                {(champion.country || champion.industry) && (
                  <p className="mt-2 text-[11px] text-muted-foreground truncate">
                    {[champion.country, champion.industry].filter(Boolean).join(" · ")}
                  </p>
                )}

                {/* Contact icons */}
                <div className="mt-2 flex items-center gap-2">
                  {champion.linkedin_url && (
                    <Linkedin className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  {champion.email && (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  {champion.phone && (
                    <span className="text-[10px] text-muted-foreground/50">📞</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {filteredChampions.length === 0 && champions.length > 0 && (
        <div className="py-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No se encontraron champions con los filtros seleccionados
          </p>
        </div>
      )}

      {/* Delete dialog */}
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

// Stat card component
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${color || ""}`}>{value}</p>
    </div>
  )
}

// Sort button component
function SortButton({
  field,
  current,
  dir,
  onSort,
  children,
}: {
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
  children: React.ReactNode
}) {
  const isActive = current === field
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      {children}
      {isActive ? (
        dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
