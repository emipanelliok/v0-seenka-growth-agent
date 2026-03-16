"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Check,
  X,
  Send,
  Mail,
  Linkedin,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  XCircle,
  Clock,
  AlertCircle,
  Filter,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface QueueItem {
  id: string
  user_id: string
  efemeride_id: string | null
  champion_id: string
  channel: string
  stage: string
  message: string
  subject_line: string | null
  seenka_data_used: string | null
  status: string
  error_message: string | null
  generated_at: string
  reviewed_at: string | null
  sent_at: string | null
  created_at: string
}

interface ChampionInfo {
  id: string
  name: string
  company: string | null
  role: string | null
  email: string | null
  linkedin_url: string | null
  champion_type: string
  country: string | null
}

interface EfemerideInfo {
  id: string
  name: string
  event_date: string
}

interface Props {
  items: QueueItem[]
  champions: ChampionInfo[]
  efemerides: EfemerideInfo[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending_review: { label: "Pendiente", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved: { label: "Aprobado", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Check },
  sending: { label: "Enviando", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Loader2 },
  sent: { label: "Enviado", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCheck },
  failed: { label: "Fallido", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
  rejected: { label: "Rechazado", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
}

export function OutreachQueue({ items, champions, efemerides }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [queueItems, setQueueItems] = useState(items)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterEfemeride, setFilterEfemeride] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState("")
  const [editSubject, setEditSubject] = useState("")
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [sendingApproved, setSendingApproved] = useState(false)
  const [processingExisting, setProcessingExisting] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

  const champMap = new Map(champions.map((c) => [c.id, c]))
  const efeMap = new Map(efemerides.map((e) => [e.id, e]))

  // Filtered items
  const filtered = queueItems.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false
    if (filterEfemeride !== "all" && item.efemeride_id !== filterEfemeride) return false
    return true
  })

  // Counts
  const pendingCount = queueItems.filter((i) => i.status === "pending_review").length
  const approvedCount = queueItems.filter((i) => i.status === "approved").length
  const sentCount = queueItems.filter((i) => i.status === "sent").length

  const setProcessing = (id: string, val: boolean) => {
    setProcessingIds((prev) => {
      const next = new Set(prev)
      val ? next.add(id) : next.delete(id)
      return next
    })
  }

  // Approve single
  const approveItem = async (id: string) => {
    setProcessing(id, true)
    await supabase
      .from("outreach_queue")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", id)
    setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "approved", reviewed_at: new Date().toISOString() } : i))
    setProcessing(id, false)
  }

  // Reject single
  const rejectItem = async (id: string) => {
    setProcessing(id, true)
    await supabase
      .from("outreach_queue")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id)
    setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "rejected", reviewed_at: new Date().toISOString() } : i))
    setProcessing(id, false)
  }

  // Save edited message
  const saveEdit = async (id: string) => {
    setProcessing(id, true)
    await supabase
      .from("outreach_queue")
      .update({ message: editMessage, subject_line: editSubject || null })
      .eq("id", id)
    setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, message: editMessage, subject_line: editSubject || null } : i))
    setEditingId(null)
    setProcessing(id, false)
  }

  // Approve all pending
  const approveAll = async () => {
    const pendingIds = filtered.filter((i) => i.status === "pending_review").map((i) => i.id)
    if (pendingIds.length === 0) return
    for (const id of pendingIds) {
      setProcessing(id, true)
    }
    await supabase
      .from("outreach_queue")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .in("id", pendingIds)
    setQueueItems((prev) => prev.map((i) =>
      pendingIds.includes(i.id) ? { ...i, status: "approved", reviewed_at: new Date().toISOString() } : i
    ))
    for (const id of pendingIds) {
      setProcessing(id, false)
    }
  }

  // Send all approved
  const sendAllApproved = async () => {
    setSendingApproved(true)
    setSendError(null)
    setSendSuccess(null)
    try {
      const res = await fetch("/api/outreach/send-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setSendError(data.error || "Error desconocido al enviar")
        console.error("[v0] Send error:", data)
        return
      }
      
      // Success
      setSendSuccess(`✅ ${data.sent} mensaje(s) enviado(s)${data.failed > 0 ? ` (${data.failed} fallaron)` : ""}`)
      
      // Refresh to update statuses
      router.refresh()
      
      // Optimistically update statuses
      const approvedIds = queueItems.filter((i) => i.status === "approved").map((i) => i.id)
      setQueueItems((prev) => prev.map((i) =>
        approvedIds.includes(i.id) ? { ...i, status: "sent", sent_at: new Date().toISOString() } : i
      ))
      
      // Clear success message after 5 seconds
      setTimeout(() => setSendSuccess(null), 5000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error desconocido"
      setSendError(`Error: ${errorMsg}`)
      console.error("[v0] Send error:", err)
    } finally {
      setSendingApproved(false)
    }
  }

  // Delete item
  const deleteItem = async (id: string) => {
    setProcessing(id, true)
    await supabase.from("outreach_queue").delete().eq("id", id)
    setQueueItems((prev) => prev.filter((i) => i.id !== id))
    setProcessing(id, false)
  }

  // Process existing replies with AI
  const processExistingReplies = async () => {
    setProcessingExisting(true)
    try {
      const res = await fetch("/api/test/process-existing-replies", {
        method: "POST",
      })
      if (res.ok) {
        const result = await res.json()
        console.log("Processed existing replies:", result)
        // Refresh to see new drafts
        router.refresh()
      }
    } catch (err) {
      console.error("Error processing existing replies:", err)
    } finally {
      setProcessingExisting(false)
    }
  }

  const startEditing = (item: QueueItem) => {
    setEditingId(item.id)
    setEditMessage(item.message)
    setEditSubject(item.subject_line || "")
    setExpandedId(item.id)
  }

  return (
    <div className="space-y-6">
      {/* Error message */}
      {sendError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-900">Error al enviar</p>
            <p className="text-sm text-red-700 mt-1">{sendError}</p>
          </div>
          <button onClick={() => setSendError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {/* Success message */}
      {sendSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-start gap-3">
          <CheckCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 flex-1">{sendSuccess}</p>
          <button onClick={() => setSendSuccess(null)} className="text-green-500 hover:text-green-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={processExistingReplies}
          disabled={processingExisting}
          variant="outline"
          className="gap-2"
        >
          {processingExisting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando respuestas...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Generar respuestas con IA
            </>
          )}
        </Button>
        <Button
          onClick={sendAllApproved}
          disabled={approvedCount === 0 || sendingApproved}
          className="gap-2"
        >
          {sendingApproved ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Enviar aprobados ({approvedCount})
            </>
          )}
        </Button>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-2"><Clock className="h-4 w-4 text-amber-700" /></div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2"><Check className="h-4 w-4 text-blue-700" /></div>
            <div>
              <p className="text-2xl font-bold">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Aprobados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2"><CheckCheck className="h-4 w-4 text-green-700" /></div>
            <div>
              <p className="text-2xl font-bold">{sentCount}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending_review">Pendientes</SelectItem>
              <SelectItem value="approved">Aprobados</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="failed">Fallidos</SelectItem>
              <SelectItem value="rejected">Rechazados</SelectItem>
            </SelectContent>
          </Select>
          {efemerides.length > 1 && (
            <Select value={filterEfemeride} onValueChange={setFilterEfemeride}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Efeméride" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las efemérides</SelectItem>
                {efemerides.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {pendingCount > 0 && (
            <Button variant="outline" size="sm" onClick={approveAll}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Aprobar todos ({filtered.filter((i) => i.status === "pending_review").length})
            </Button>
          )}
          {approvedCount > 0 && (
            <Button size="sm" onClick={sendAllApproved} disabled={sendingApproved}>
              {sendingApproved ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {sendingApproved ? "Enviando..." : `Enviar aprobados (${approvedCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* Queue list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No hay mensajes en la bandeja.</p>
            <p className="text-sm mt-1">Generá outreach desde una efeméride para empezar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const champ = champMap.get(item.champion_id)
            const efe = item.efemeride_id ? efeMap.get(item.efemeride_id) : null
            const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending_review
            const isExpanded = expandedId === item.id
            const isEditing = editingId === item.id
            const isProcessing = processingIds.has(item.id)
            const StatusIcon = statusConf.icon

            return (
              <Card key={item.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => {
                    if (!isEditing) setExpandedId(isExpanded ? null : item.id)
                  }}
                >
                  {/* Channel icon */}
                  <div className="shrink-0">
                    {item.channel === "email" ? (
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Linkedin className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Champion info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{champ?.name || "Champion desconocido"}</span>
                      {champ?.company && (
                        <span className="text-xs text-muted-foreground truncate">- {champ.company}</span>
                      )}
                    </div>
                    {efe && (
                      <p className="text-xs text-muted-foreground truncate">{efe.name} ({efe.event_date})</p>
                    )}
                  </div>

                  {/* Subject line preview for emails */}
                  {item.subject_line && (
                    <span className="hidden md:block text-xs text-muted-foreground truncate max-w-[200px]">
                      {item.subject_line}
                    </span>
                  )}

                  {/* Status badge */}
                  <Badge variant="outline" className={`shrink-0 text-xs gap-1 ${statusConf.color}`}>
                    <StatusIcon className={`h-3 w-3 ${item.status === "sending" ? "animate-spin" : ""}`} />
                    {statusConf.label}
                  </Badge>

                  {/* Expand icon */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-3">
                    {item.subject_line && !isEditing && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                        <p className="text-sm font-medium">{item.subject_line}</p>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-3">
                        {item.channel === "email" && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                            <Input
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="Subject del email..."
                            />
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Mensaje</p>
                          <Textarea
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            rows={6}
                            className="text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => saveEdit(item.id)} disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                            Guardar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Mensaje</p>
                        <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{item.message}</p>
                      </div>
                    )}

                    {item.error_message && (
                      <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {item.error_message}
                      </div>
                    )}

                    {item.seenka_data_used && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Ver dato Seenka usado
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap bg-muted/30 rounded p-2">{item.seenka_data_used}</p>
                      </details>
                    )}

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        {item.status === "pending_review" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => approveItem(item.id)} disabled={isProcessing}>
                              <Check className="mr-1 h-3 w-3" /> Aprobar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => startEditing(item)}>
                              <Pencil className="mr-1 h-3 w-3" /> Editar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rejectItem(item.id)} disabled={isProcessing}>
                              <X className="mr-1 h-3 w-3" /> Rechazar
                            </Button>
                          </>
                        )}
                        {item.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => startEditing(item)}>
                            <Pencil className="mr-1 h-3 w-3" /> Editar antes de enviar
                          </Button>
                        )}
                        {(item.status === "rejected" || item.status === "failed") && (
                          <Button size="sm" variant="destructive" onClick={() => deleteItem(item.id)} disabled={isProcessing}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
