"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { Interaction, Champion, Trigger, InteractionOutcome, InteractionChannel } from "@/lib/types"
import { CHANNEL_LABELS } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Search,
  MessageSquare,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  Sparkles,
  Send,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

interface InteractionWithDetails extends Interaction {
  champion: Champion | null
  trigger: Trigger | null
}

interface InteractionsListProps {
  interactions: InteractionWithDetails[]
}

export function InteractionsList({ interactions }: InteractionsListProps) {
  const [search, setSearch] = useState("")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all")
  const [editingInteraction, setEditingInteraction] = useState<InteractionWithDetails | null>(null)
  const [response, setResponse] = useState("")
  const [outcome, setOutcome] = useState<InteractionOutcome>("sent")
  const [isUpdating, setIsUpdating] = useState(false)
  const router = useRouter()

  const filteredInteractions = interactions.filter((interaction) => {
    const matchesSearch =
      interaction.message.toLowerCase().includes(search.toLowerCase()) ||
      interaction.champion?.name.toLowerCase().includes(search.toLowerCase()) ||
      interaction.insight?.toLowerCase().includes(search.toLowerCase())

    const matchesChannel =
      channelFilter === "all" || interaction.channel === channelFilter

    const matchesOutcome =
      outcomeFilter === "all" || interaction.outcome === outcomeFilter

    return matchesSearch && matchesChannel && matchesOutcome
  })

  const handleUpdate = async () => {
    if (!editingInteraction) return
    setIsUpdating(true)

    const supabase = createClient()
    const { error } = await supabase
      .from("interactions")
      .update({
        response: response || null,
        outcome,
      })
      .eq("id", editingInteraction.id)

    if (!error && editingInteraction.champion) {
      // Update champion status based on outcome
      const newStatus = outcome === "responded" ? "responded" : editingInteraction.champion.status
      await supabase
        .from("champions")
        .update({ status: newStatus })
        .eq("id", editingInteraction.champion.id)
    }

    setIsUpdating(false)
    setEditingInteraction(null)
    setResponse("")
    setOutcome("sent")
    router.refresh()
  }

  const openEditDialog = (interaction: InteractionWithDetails) => {
    setEditingInteraction(interaction)
    setResponse(interaction.response || (interaction as any).reply_content || "")
    setOutcome(interaction.outcome)
  }

  if (interactions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No hay interacciones</h3>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Las interacciones se registran cuando generas y envías mensajes a tus champions.
          </p>
        </CardContent>
      </Card>
    )
  }

  const outcomeConfig: Record<InteractionOutcome, { label: string; icon: typeof Clock; className: string }> = {
    sent: { label: "Enviado", icon: Clock, className: "text-primary" },
    responded: { label: "Respondido", icon: CheckCircle, className: "text-chart-2" },
    ignored: { label: "Sin respuesta", icon: XCircle, className: "text-muted-foreground" },
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por mensaje, champion o insight..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los resultados</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="responded">Respondido</SelectItem>
            <SelectItem value="ignored">Sin respuesta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {filteredInteractions.map((interaction) => {
          const outcomeInfo = outcomeConfig[interaction.outcome]
          const OutcomeIcon = outcomeInfo.icon

          return (
            <Card key={interaction.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline">
                        {CHANNEL_LABELS[interaction.channel]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={outcomeInfo.className}
                      >
                        <OutcomeIcon className="mr-1 h-3 w-3" />
                        {outcomeInfo.label}
                      </Badge>
                    </div>
                    {interaction.champion && (
                      <CardTitle className="text-base">
                        <Link
                          href={`/champions/${interaction.champion.id}`}
                          className="hover:underline"
                        >
                          {interaction.champion.name}
                        </Link>
                        {interaction.champion.company && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            - {interaction.champion.company}
                          </span>
                        )}
                      </CardTitle>
                    )}
                    <CardDescription>
                      {new Date(interaction.created_at).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(interaction)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      Actualizar
                    </Button>
                    {interaction.champion && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/champions/${interaction.champion.id}`}>
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Ver champion
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {interaction.insight && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Insight:</p>
                    <p className="text-sm">{interaction.insight}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Mensaje enviado:</p>
                  <p className="text-sm text-muted-foreground">{interaction.message}</p>
                </div>
                {interaction.response && (
                  <div className="rounded-lg bg-chart-2/10 p-3">
                    <p className="text-xs font-medium text-chart-2 mb-1">Respuesta recibida:</p>
                    <p className="text-sm">{interaction.response}</p>
                  </div>
                )}
                {(interaction as any).reply_content && (
                  <div className="rounded-lg bg-chart-2/10 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-chart-2 mb-1">Respuesta del champion:</p>
                        <p className="text-sm">{(interaction as any).reply_content}</p>
                      </div>
                      {(interaction as any).reply_sentiment && (
                        <Badge variant="secondary" className="mt-0.5">
                          {(interaction as any).reply_sentiment === "positive"
                            ? "Positivo"
                            : (interaction as any).reply_sentiment === "negative"
                            ? "Negativo"
                            : "Neutral"}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {(interaction as any).reply_content && (
                  <AISuggestionBox 
                    interaction={interaction} 
                    championId={interaction.champion_id}
                    championName={interaction.champion?.name || "Champion"}
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredInteractions.length === 0 && interactions.length > 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No se encontraron interacciones con los filtros seleccionados
        </div>
      )}

      <Dialog open={!!editingInteraction} onOpenChange={() => setEditingInteraction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar Interacción</DialogTitle>
            <DialogDescription>
              Registra la respuesta y actualiza el resultado de esta interacción.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Resultado</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as InteractionOutcome)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent">Enviado (esperando)</SelectItem>
                  <SelectItem value="responded">Respondido</SelectItem>
                  <SelectItem value="ignored">Sin respuesta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Respuesta recibida (opcional)</Label>
              <Textarea
                placeholder="Pega aquí la respuesta que recibiste..."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingInteraction(null)}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// AI Suggestion Box Component
function AISuggestionBox({ 
  interaction, 
  championId, 
  championName 
}: { 
  interaction: InteractionWithDetails
  championId: string
  championName: string
}) {
  const [suggestion, setSuggestion] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [editedMessage, setEditedMessage] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const generateSuggestion = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/generate-reply-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championId,
          replyContent: (interaction as any).reply_content,
          replySentiment: (interaction as any).reply_sentiment,
        })
      })
      if (res.ok) {
        const data = await res.json()
        console.log("[v0] Suggestion data received:", data)
        setSuggestion(data)
        
        // Si la acción es stand_by, mostrar el razonamiento; si no, mostrar el mensaje generado
        if (data.accion === "stand_by" || data.action === "stand_by") {
          setEditedMessage(`[STAND BY]\n\n${data.razonamiento || "En pausa hasta nueva información"}`)
        } else {
          setEditedMessage(data.generatedResponse || "")
        }
        
        setGenerated(true)
      } else {
        console.error("[v0] Response not ok:", res.status, res.statusText)
        const errorData = await res.json().catch(() => null)
        console.error("[v0] Error details:", errorData)
      }
    } catch (err) {
      console.error("Error generating suggestion:", err)
      setLoading(false)
      // Mostrar error pero no ocultar UI
    } finally {
      setLoading(false)
    }
  }

  const [approved, setApproved] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)

  const approveSuggestion = async () => {
    // Permitir si hay mensaje editado O si es una acción especial (stand_by, etc)
    if (!editedMessage && !(suggestion?.accion || suggestion?.action)) return
    
    setSending(true)
    setApprovalError(null)
    try {
      const action = suggestion?.accion || suggestion?.action || "continuar"
      
      // Si es stand_by, no enviar mensaje, solo registrar la acción
      if (action === "stand_by") {
        const { error } = await supabase.from("champion_sequences").update({
          metadata: {
            status: "stand_by",
            temperature: suggestion.temperatura,
            intent: suggestion.intent,
            reasoning: suggestion.razonamiento,
            last_reviewed_at: new Date().toISOString()
          },
          status: "paused"
        }).eq("champion_id", championId).eq("status", "active")
        
        if (error) throw error
        setApproved(true)
      } else {
        // Guardar mensaje en la cola de salida
        const { error: queueError } = await supabase.from("outreach_queue").insert({
          champion_id: championId,
          channel: "email",
          message: editedMessage || suggestion.generatedResponse,
          subject_line: suggestion.suggestedSubject || "Re: Seguimiento",
          status: "approved",
          priority: 1,
          metadata: {
            auto_generated: true,
            intent_detected: suggestion.intent,
            action_type: action,
            temperature: suggestion.temperatura,
            reasoning: suggestion.razonamiento
          }
        })
        
        if (queueError) throw queueError
        
        // Registrar la interacción
        await supabase.from("interactions").insert({
          champion_id: championId,
          channel: "email",
          message: editedMessage || suggestion.generatedResponse,
          outcome: "sent",
          insight: `Respuesta generada por IA (${action})`,
        })
        
        setApproved(true)
      }
      
      // Mostrar confirmación por 2 segundos antes de limpiar
      setTimeout(() => {
        setSuggestion(null)
        setGenerated(false)
        setApproved(false)
        router.refresh()
      }, 2000)
    } catch (err) {
      console.error("Error approving suggestion:", err)
      setApprovalError("Error al guardar. Intentá de nuevo.")
    } finally {
      setSending(false)
    }
  }

  const rejectSuggestion = () => {
    setSuggestion(null)
    setGenerated(false)
    setEditedMessage("")
  }

  if (!generated) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">Generar respuesta con IA</span>
          </div>
          <Button 
            size="sm" 
            variant="outline"
            onClick={generateSuggestion}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analizando...
              </>
            ) : (
              "Sugerir respuesta"
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (approved) {
    return (
      <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 mt-2">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Mensaje guardado en bandeja de salida</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mt-2 space-y-3">
      {approvalError && (
        <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
          {approvalError}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Sugerencia de IA</span>
        </div>
        <div className="flex items-center gap-1">
          {suggestion?.intent && (
            <Badge variant="outline" className="text-xs">
              {suggestion.intent}
            </Badge>
          )}
          {suggestion?.action && (
            <Badge variant="secondary" className="text-xs">
              {suggestion.action}
            </Badge>
          )}
        </div>
      </div>

      {suggestion?.reasoning && (
        <p className="text-xs text-muted-foreground italic">
          {suggestion.reasoning}
        </p>
      )}

      {isEditing ? (
        <Textarea
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          rows={4}
          className="text-sm"
        />
      ) : (
        <div className="bg-background rounded p-2 text-sm">
          {editedMessage || suggestion?.generatedResponse || "No se generó respuesta"}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsEditing(!isEditing)}
        >
          <Edit className="h-3 w-3 mr-1" />
          {isEditing ? "Ver" : "Editar"}
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={rejectSuggestion}
            disabled={sending}
          >
            <ThumbsDown className="h-3 w-3 mr-1" />
            Descartar
          </Button>
          <Button
            size="sm"
            onClick={approveSuggestion}
            disabled={sending || (!editedMessage && !suggestion?.generatedResponse)}
          >
            {sending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ThumbsUp className="h-3 w-3 mr-1" />
            )}
            Aprobar y enviar
          </Button>
        </div>
      </div>
    </div>
  )
}
