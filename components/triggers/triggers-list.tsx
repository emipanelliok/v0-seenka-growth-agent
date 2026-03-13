"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Trigger, Champion, TriggerSeverity, TriggerType, SeenkaProduct } from "@/lib/types"
import { TRIGGER_TYPE_LABELS, SEVERITY_LABELS, SEENKA_PRODUCTS } from "@/lib/types"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Search, Trash2, Zap, CheckCircle, XCircle, Package, Users, Share2, ExternalLink, Star } from "lucide-react"

interface TriggerWithChampion extends Trigger {
  champion: Champion | null
}

interface TriggersListProps {
  triggers: TriggerWithChampion[]
}

export function TriggersList({ triggers }: TriggersListProps) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [worthFilter, setWorthFilter] = useState<string>("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const filteredTriggers = triggers.filter((trigger) => {
    const matchesSearch =
      trigger.source_text.toLowerCase().includes(search.toLowerCase()) ||
      trigger.topic?.toLowerCase().includes(search.toLowerCase()) ||
      trigger.champion?.name.toLowerCase().includes(search.toLowerCase())

    const matchesType = typeFilter === "all" || trigger.type === typeFilter
    const matchesSeverity = severityFilter === "all" || trigger.severity === severityFilter
    const matchesWorth =
      worthFilter === "all" ||
      (worthFilter === "yes" && trigger.is_worth_contacting) ||
      (worthFilter === "no" && !trigger.is_worth_contacting)

    return matchesSearch && matchesType && matchesSeverity && matchesWorth
  })

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)

    const supabase = createClient()
    const { error } = await supabase.from("triggers").delete().eq("id", deleteId)

    if (!error) {
      router.refresh()
    }

    setIsDeleting(false)
    setDeleteId(null)
  }

  if (triggers.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No hay triggers</h3>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Agrega triggers para evaluar oportunidades de contacto con tus champions.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por contenido, tema o champion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full lg:w-[150px]">
            <SelectValue placeholder="Severidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={worthFilter} onValueChange={setWorthFilter}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Vale contactar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Vale contactar</SelectItem>
            <SelectItem value="no">No vale contactar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {filteredTriggers.map((trigger) => (
          <TriggerCard
            key={trigger.id}
            trigger={trigger}
            onDelete={() => setDeleteId(trigger.id)}
          />
        ))}
      </div>

      {filteredTriggers.length === 0 && triggers.length > 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No se encontraron triggers con los filtros seleccionados
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar trigger?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
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

function TriggerCard({
  trigger,
  onDelete,
}: {
  trigger: TriggerWithChampion
  onDelete: () => void
}) {
  const severityColors: Record<TriggerSeverity, string> = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-accent/10 text-accent-foreground border-accent/20",
    low: "bg-muted text-muted-foreground border-muted",
  }

  const typeColors: Record<TriggerType, string> = {
    post: "bg-primary/10 text-primary",
    shared: "bg-chart-4/10 text-chart-4",
    data_seenka: "bg-chart-2/10 text-chart-2",
    market_context: "bg-chart-3/10 text-chart-3",
  }

  return (
    <Card className={`transition-shadow hover:shadow-md ${trigger.is_worth_contacting ? "border-accent/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="outline" className={typeColors[trigger.type]}>
                {TRIGGER_TYPE_LABELS[trigger.type]}
              </Badge>
              <Badge variant="outline" className={severityColors[trigger.severity]}>
                {SEVERITY_LABELS[trigger.severity]}
              </Badge>
              {trigger.is_worth_contacting ? (
                <Badge variant="outline" className="bg-chart-2/10 text-chart-2 border-chart-2/20">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Vale contactar
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="mr-1 h-3 w-3" />
                  No contactar
                </Badge>
              )}
            </div>
            <CardTitle className="text-base">
              {trigger.topic || "Sin tema identificado"}
            </CardTitle>
            {trigger.champion && (
              <CardDescription>
                Champion: {trigger.champion.name}
                {trigger.champion.company && ` - ${trigger.champion.company}`}
              </CardDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Eliminar</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Shared Post Info */}
        {trigger.type === "shared" && trigger.original_author_name && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Share2 className="h-3 w-3" />
              Compartió post de:
            </div>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-500" />
                  {trigger.original_author_name}
                </p>
                {trigger.original_author_role && (
                  <p className="text-xs text-muted-foreground">{trigger.original_author_role}</p>
                )}
              </div>
              {trigger.original_author_linkedin && (
                <a
                  href={trigger.original_author_linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {trigger.champion_comment && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Comentario del champion:</p>
                <p className="text-sm italic">"{trigger.champion_comment}"</p>
              </div>
            )}
            {trigger.mentions_seenka && (
              <Badge className="bg-primary/20 text-primary text-xs">
                Menciona Seenka
              </Badge>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground line-clamp-3">
          {trigger.type === "shared" && trigger.original_content 
            ? trigger.original_content 
            : trigger.source_text}
        </p>
        
        {trigger.recommended_products && trigger.recommended_products.length > 0 && (
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-primary mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {trigger.recommended_products.map((product) => (
                <Badge key={product} variant="secondary" className="text-xs">
                  {SEENKA_PRODUCTS[product as SeenkaProduct]?.name || product}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {trigger.mentioned_people && Array.isArray(trigger.mentioned_people) && trigger.mentioned_people.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 text-accent mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {(trigger.mentioned_people as Array<{ name: string; role?: string; company?: string }>).map((person, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {person.name}
                  {person.role && ` (${person.role})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {new Date(trigger.created_at).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </CardContent>
    </Card>
  )
}
