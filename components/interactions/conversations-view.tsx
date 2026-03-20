"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Mail, Linkedin, Loader2, Pencil, X, MessageSquare, Sparkles, RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ChampionInfo {
  id: string
  name: string
  company: string | null
  role: string | null
  email: string | null
  linkedin_url: string | null
}

interface InteractionData {
  id: string
  champion_id: string
  message: string
  response: string | null
  reply_content?: string | null
  reply_sentiment?: string | null
  outcome: "sent" | "responded" | "ignored"
  channel: string
  insight: string | null
  created_at: string
}

interface QueueItem {
  id: string
  champion_id: string
  message: string
  subject_line: string | null
  channel: string
  status: string
  created_at: string
  efemeride_id: string | null
}

interface ConversationsViewProps {
  interactions: InteractionData[]
  queueItems: QueueItem[]
  champions: ChampionInfo[]
  loadedAt?: string
}

interface ThreadMsg {
  id: string
  type: "gaston" | "champion" | "pending"
  content: string
  channel: string
  timestamp: string
  sentiment?: string | null
  queueItem?: QueueItem
}

// Strip quoted reply lines, email signatures and thread history
function stripQuoted(text: string): string {
  if (!text) return ""
  const lines = text.split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    // Stop at quoted thread indicators
    if (/^On .+ wrote:/i.test(t)) break
    if (/^El .+(escribi[oó]:|wrote:)/i.test(t)) break
    // Stop at signature delimiter
    if (/^--\s*$/.test(t)) break
    // Stop at separator lines
    if (/^-{3,}/.test(t) || /^_{3,}/.test(t)) break
    // Skip quoted lines
    if (t.startsWith(">")) continue
    // Stop at common signature patterns (name + company + phone block)
    if (i > 0 && /^\+\d[\d\s]{6,}$/.test(t)) break
    if (/^(Agendemos|Agendamos)\s/i.test(t)) break
    out.push(lines[i])
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop()
  return out.join("\n").trim()
}

function timeLabel(ts: string): string {
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  if (days === 1) return "Ayer"
  if (days < 7) return `Hace ${days} días`
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

export function ConversationsView({ interactions, queueItems, champions, loadedAt }: ConversationsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localQueue, setLocalQueue] = useState(queueItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMsg, setEditMsg] = useState("")
  const [editSubject, setEditSubject] = useState("")
  const [processingId, setProcessingId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  const champMap = new Map(champions.map((c) => [c.id, c]))

  // Build conversation map keyed by champion_id
  type ConvEntry = {
    champion: ChampionInfo
    lastActivity: string
    messages: ThreadMsg[]
    pendingCount: number
  }
  const convMap = new Map<string, ConvEntry>()

  const ensure = (champId: string, ts: string) => {
    const champ = champMap.get(champId)
    if (!champ) return null
    if (!convMap.has(champId)) {
      convMap.set(champId, { champion: champ, lastActivity: ts, messages: [], pendingCount: 0 })
    }
    const c = convMap.get(champId)!
    if (ts > c.lastActivity) c.lastActivity = ts
    return c
  }

  // Process sent interactions (ascending order so messages are sorted in thread)
  const sortedInteractions = [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  for (const ix of sortedInteractions) {
    const c = ensure(ix.champion_id, ix.created_at)
    if (!c) continue
    c.messages.push({
      id: `sent-${ix.id}`,
      type: "gaston",
      content: ix.message,
      channel: ix.channel,
      timestamp: ix.created_at,
    })
    const replyRaw = ix.reply_content || ix.response
    if (replyRaw && ix.outcome === "responded") {
      const clean = stripQuoted(replyRaw)
      if (clean) {
        c.messages.push({
          id: `reply-${ix.id}`,
          type: "champion",
          content: clean,
          channel: ix.channel,
          timestamp: ix.created_at,
          sentiment: ix.reply_sentiment,
        })
      }
    }
  }

  // Process pending queue items
  const pendingQueue = localQueue.filter((q) => ["pending_review", "approved"].includes(q.status))
  for (const q of pendingQueue) {
    const c = ensure(q.champion_id, q.created_at)
    if (!c) continue
    c.pendingCount++
    c.messages.push({
      id: `pending-${q.id}`,
      type: "pending",
      content: q.message,
      channel: q.channel,
      timestamp: q.created_at,
      queueItem: q,
    })
  }

  const sorted = Array.from(convMap.values()).sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  )

  // Auto-select first
  useEffect(() => {
    if (!selectedId && sorted.length > 0) setSelectedId(sorted[0].champion.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  const [lastRefresh, setLastRefresh] = useState(loadedAt || new Date().toISOString())
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30)

  useEffect(() => {
    setLastRefresh(loadedAt || new Date().toISOString())
    setSecondsUntilRefresh(30)
  }, [loadedAt])

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          // Force full page reload to bypass Next.js cache
          window.location.reload()
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to bottom when switching conversations
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }, [selectedId])

  const selected = selectedId ? convMap.get(selectedId) : sorted[0] ?? null

  // Send via channel: approve + update channel + send-approved
  const handleSend = async (item: QueueItem, channel: "email" | "linkedin") => {
    setProcessingId(item.id)
    try {
      // Update channel + approve
      await supabase
        .from("outreach_queue")
        .update({ status: "approved", channel, reviewed_at: new Date().toISOString() })
        .eq("id", item.id)

      // Trigger send-approved (sends all approved items)
      await fetch("/api/outreach/send-approved", { method: "POST" })

      // Remove from local state
      setLocalQueue((prev) => prev.filter((i) => i.id !== item.id))
      router.refresh()
    } catch (err) {
      console.error("Error sending:", err)
    } finally {
      setProcessingId(null)
      setEditingId(null)
    }
  }

  const handleReject = async (itemId: string) => {
    setProcessingId(itemId)
    await supabase
      .from("outreach_queue")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", itemId)
    setLocalQueue((prev) => prev.filter((i) => i.id !== itemId))
    setProcessingId(null)
  }

  const handleSaveEdit = async (itemId: string) => {
    await supabase
      .from("outreach_queue")
      .update({ message: editMsg, subject_line: editSubject || null })
      .eq("id", itemId)
    setLocalQueue((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, message: editMsg, subject_line: editSubject || null } : i))
    )
    setEditingId(null)
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <MessageSquare className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Sin conversaciones</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Las conversaciones aparecen acá cuando Gastón envía mensajes o cuando hay mensajes pendientes de aprobación.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: conversation list ── */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col bg-background">
        <div className="px-4 py-3 border-b">
          <h1 className="text-sm font-semibold">Conversaciones</h1>
          <p className="text-xs text-muted-foreground">{sorted.length} champions</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="divide-y">
            {sorted.map((conv) => {
              const lastNonPending = [...conv.messages].reverse().find((m) => m.type !== "pending")
              const isActive = selectedId === conv.champion.id
              return (
                <button
                  key={conv.champion.id}
                  type="button"
                  onClick={() => setSelectedId(conv.champion.id)}
                  className={cn(
                    "w-full text-left p-3 transition-colors hover:bg-muted/50",
                    isActive && "bg-primary/5 border-r-2 border-primary"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {conv.champion.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{conv.champion.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">
                          {timeLabel(conv.lastActivity)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.champion.company || conv.champion.role || ""}
                      </p>
                      {lastNonPending && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-70">
                          {lastNonPending.type === "gaston" ? "↑ " : "↓ "}
                          {lastNonPending.content.slice(0, 38)}…
                        </p>
                      )}
                    </div>
                    {conv.pendingCount > 0 && (
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                        {conv.pendingCount}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right panel: thread ── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Thread header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b bg-background flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {selected.champion.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{selected.champion.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[selected.champion.role, selected.champion.company].filter(Boolean).join(" @ ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Actualizar ahora"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Actualiza en {secondsUntilRefresh}s</span>
              </button>
              <div className="flex items-center gap-1.5">
                {selected.champion.email && (
                  <Badge variant="outline" className="gap-1 text-xs py-0.5">
                    <Mail className="h-3 w-3" />
                    Email
                  </Badge>
                )}
                {selected.champion.linkedin_url && (
                  <Badge variant="outline" className="gap-1 text-xs py-0.5">
                    <Linkedin className="h-3 w-3" />
                    LinkedIn
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <div className="space-y-3 max-w-2xl mx-auto">
              {selected.messages
                .filter((m) => m.type !== "pending")
                .map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} champion={selected.champion} />
                ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Pending approval boxes */}
          {selected.messages.some((m) => m.type === "pending") && (
            <div className="flex-shrink-0 border-t bg-muted/10 px-5 py-4 space-y-3">
              {selected.messages
                .filter((m) => m.type === "pending" && m.queueItem)
                .map((msg) => (
                  <ApprovalBox
                    key={msg.id}
                    item={msg.queueItem!}
                    champion={selected.champion}
                    editingId={editingId}
                    editMsg={editMsg}
                    editSubject={editSubject}
                    processingId={processingId}
                    onEdit={(i) => { setEditingId(i.id); setEditMsg(i.message); setEditSubject(i.subject_line || "") }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={handleSaveEdit}
                    onReject={handleReject}
                    onSend={handleSend}
                    onMsgChange={setEditMsg}
                    onSubjectChange={setEditSubject}
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Seleccioná una conversación</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chat bubble ──
function ChatBubble({ msg, champion }: { msg: ThreadMsg; champion: ChampionInfo }) {
  const isGaston = msg.type === "gaston"

  const sentimentMap: Record<string, { label: string; cls: string }> = {
    positive: { label: "Positivo", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    negative: { label: "Negativo", cls: "bg-red-100 text-red-700 border-red-200" },
    neutral: { label: "Neutral", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  }
  const senti = msg.sentiment ? sentimentMap[msg.sentiment] : null

  return (
    <div className={cn("flex gap-2.5", isGaston && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold mt-1",
          isGaston ? "bg-primary text-primary-foreground" : "bg-muted border text-foreground"
        )}
      >
        {isGaston ? "G" : champion.name.charAt(0).toUpperCase()}
      </div>

      {/* Bubble + meta */}
      <div className={cn("max-w-[72%] space-y-1", isGaston && "items-end flex flex-col")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isGaston ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <div className={cn("flex items-center gap-1.5 px-1", isGaston && "flex-row-reverse")}>
          <span className="text-[10px] text-muted-foreground">{timeLabel(msg.timestamp)}</span>
          {msg.channel === "email" ? (
            <Mail className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Linkedin className="h-3 w-3 text-muted-foreground" />
          )}
          {senti && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-4 border", senti.cls)}
            >
              {senti.label}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pending approval box ──
interface ApprovalBoxProps {
  item: QueueItem
  champion: ChampionInfo
  editingId: string | null
  editMsg: string
  editSubject: string
  processingId: string | null
  onEdit: (i: QueueItem) => void
  onCancelEdit: () => void
  onSaveEdit: (id: string) => void
  onReject: (id: string) => void
  onSend: (i: QueueItem, ch: "email" | "linkedin") => void
  onMsgChange: (v: string) => void
  onSubjectChange: (v: string) => void
}

function ApprovalBox({
  item, champion, editingId, editMsg, editSubject, processingId,
  onEdit, onCancelEdit, onSaveEdit, onReject, onSend, onMsgChange, onSubjectChange,
}: ApprovalBoxProps) {
  const isEditing = editingId === item.id
  const isProcessing = processingId === item.id
  const hasEmail = !!champion.email
  const hasLinkedin = !!champion.linkedin_url

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Gastón generó un mensaje
        </p>
        <Badge
          variant="outline"
          className="ml-auto text-[11px] border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
        >
          {item.status === "pending_review" ? "Pendiente" : "Aprobado"}
        </Badge>
      </div>

      {/* Subject (email only, view mode) */}
      {item.subject_line && !isEditing && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Asunto</p>
          <p className="text-sm font-medium">{item.subject_line}</p>
        </div>
      )}

      {/* Message content */}
      {isEditing ? (
        <div className="space-y-2">
          {item.channel === "email" && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Asunto</p>
              <Input
                value={editSubject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Asunto del email"
                className="text-sm h-8"
              />
            </div>
          )}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Mensaje</p>
            <Textarea
              value={editMsg}
              onChange={(e) => onMsgChange(e.target.value)}
              rows={5}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSaveEdit(item.id)}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-background border px-4 py-3">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.message}</p>
        </div>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(item)}
            disabled={isProcessing}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>

          <div className="flex-1" />

          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
            onClick={() => onReject(item.id)}
            disabled={isProcessing}
          >
            <X className="h-3.5 w-3.5" />
            Descartar
          </Button>

          {hasEmail && (
            <Button
              size="sm"
              onClick={() => onSend(item, "email")}
              disabled={isProcessing}
              className="gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Enviar por Email
            </Button>
          )}

          {hasLinkedin && (
            <Button
              size="sm"
              variant={hasEmail ? "outline" : "default"}
              onClick={() => onSend(item, "linkedin")}
              disabled={isProcessing}
              className="gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Linkedin className="h-3.5 w-3.5" />
              )}
              Enviar por LinkedIn
            </Button>
          )}

          {!hasEmail && !hasLinkedin && (
            <p className="text-xs text-muted-foreground">
              Agregá email o LinkedIn al champion para enviar
            </p>
          )}
        </div>
      )}
    </div>
  )
}
