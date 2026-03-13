"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Send,
  User,
  Building2,
  Sparkles,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Linkedin,
  Mail,
  MessageCircle,
  AlertCircle,
} from "lucide-react"
import type {
  Efemeride,
  EfemerideIndustryData,
  Champion,
  OutreachChannel,
  OutreachStage,
} from "@/lib/types"
import { EFEMERIDE_COUNTRY_LABELS } from "@/lib/types"
import {
  getStageFromInteractions,
  matchChampionToEfemeride,
  type ChampionClient,
} from "@/lib/outreach-matching"

interface Interaction {
  champion_id: string
  channel: string
  created_at: string
}

interface EfemerideOutreachProps {
  efemeride: Efemeride
  industryData: EfemerideIndustryData[]
  champions: Champion[]
  allClients: ChampionClient[]
  interactions: Interaction[]
}

interface CandidateRow {
  champion: Champion
  clients: ChampionClient[]
  stage: OutreachStage
  matchedIndustryData: string | null
  selected: boolean
  channel: OutreachChannel
  customSeenkaData: string
  generatedMessage: string | null
  generating: boolean
  copied: boolean
  expanded: boolean
  sending: boolean
  sent: boolean
  sendError: string | null
}

function getStageLabel(stage: OutreachStage): string {
  switch (stage) {
    case "cold": return "Frío"
    case "warm": return "Tibio"
    case "reengagement": return "Re-engagement"
  }
}

function getStageColor(stage: OutreachStage): string {
  switch (stage) {
    case "cold": return "text-blue-600 bg-blue-50 border-blue-200"
    case "warm": return "text-amber-600 bg-amber-50 border-amber-200"
    case "reengagement": return "text-green-600 bg-green-50 border-green-200"
  }
}

function getChannelIcon(channel: OutreachChannel) {
  switch (channel) {
    case "linkedin": return Linkedin
    case "email": return Mail
    case "whatsapp": return MessageCircle
  }
}

function getChannelLabel(channel: OutreachChannel): string {
  switch (channel) {
    case "linkedin": return "LinkedIn DM"
    case "email": return "Email"
    case "whatsapp": return "WhatsApp"
  }
}

export function EfemerideOutreach({
  efemeride,
  industryData,
  champions,
  allClients,
  interactions,
}: EfemerideOutreachProps) {
  const router = useRouter()
  const eventDate = new Date(efemeride.event_date + "T00:00:00")
  const daysUntil = Math.ceil(
    (eventDate.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
  )

  // Build candidate rows
  const initialCandidates = useMemo(() => {
    const rows: CandidateRow[] = []
    for (const champ of champions) {
      const champClients = allClients.filter((c) => c.champion_id === champ.id)
      const { matches, matchedData } = matchChampionToEfemeride(
        champ, champClients, efemeride, industryData
      )
      if (!matches) continue
      rows.push({
        champion: champ,
        clients: champClients,
        stage: getStageFromInteractions(champ.id, interactions),
        matchedIndustryData: matchedData,
        selected: true,
        channel: "linkedin",
        customSeenkaData: "",
        generatedMessage: null,
        generating: false,
  copied: false,
  expanded: false,
  sending: false,
  sent: false,
  sendError: null,
  })
  }
    return rows
  }, [champions, allClients, efemeride, industryData, interactions])

  const [candidates, setCandidates] = useState<CandidateRow[]>(initialCandidates)
  const [generatingAll, setGeneratingAll] = useState(false)

  const selectedCount = candidates.filter((c) => c.selected).length

  const updateCandidate = (idx: number, updates: Partial<CandidateRow>) => {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...updates } : c))
    )
  }

  const toggleSelectAll = () => {
    const allSelected = candidates.every((c) => c.selected)
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: !allSelected })))
  }

  const generateMessage = async (idx: number) => {
    const candidate = candidates[idx]
    if (!candidate) return

    updateCandidate(idx, { generating: true })
    try {
      const daysUntil = Math.floor(
        (new Date(efemeride.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )

      console.log("[v0] generateMessage - efemeride:", {
        name: efemeride.name,
        manual_data_exists: !!efemeride.manual_data,
        manual_data_length: efemeride.manual_data?.length,
        manual_data_preview: efemeride.manual_data?.substring(0, 100)
      })

      const res = await fetch("/api/ai/efemeride-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          efemeride,
          champion: candidate.champion,
          clients: candidate.clients,
          channel: candidate.channel,
          stage: candidate.stage,
          days_until: daysUntil,
          seenka_data: efemeride.manual_data || candidate.customSeenkaData || efemeride.seenka_data_hint || candidate.matchedIndustryData || null,
        }),
      })

      if (!res.ok) throw new Error("Error generando mensaje")
      const data = await res.json()
      updateCandidate(idx, { generatedMessage: data.message, generating: false })
    } catch {
      updateCandidate(idx, { generating: false, generatedMessage: "Error al generar el mensaje. Intentá de nuevo." })
    }
  }

  const generateAllMessages = async () => {
    setGeneratingAll(true)
    const selected = candidates
      .map((c, i) => ({ ...c, idx: i }))
      .filter((c) => c.selected && !c.generatedMessage)

    for (const candidate of selected) {
      await generateMessage(candidate.idx)
    }
    setGeneratingAll(false)
  }

  const copyMessage = (idx: number) => {
    const msg = candidates[idx].generatedMessage
    if (!msg) return
    navigator.clipboard.writeText(msg)
    updateCandidate(idx, { copied: true })
    setTimeout(() => updateCandidate(idx, { copied: false }), 2000)
  }

  const sendMessage = async (idx: number) => {
    const candidate = candidates[idx]
    if (!candidate.generatedMessage) return

    updateCandidate(idx, { sending: true, sendError: null })

    try {
      const res = await fetch("/api/outreach/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion: {
            id: candidate.champion.id,
            name: candidate.champion.name,
            company: candidate.champion.company,
            role: candidate.champion.role,
            linkedin_url: candidate.champion.linkedin_url,
            email: candidate.champion.email,
            industry: candidate.champion.industry,
            country: candidate.champion.country,
          },
          trigger: {
            id: efemeride.id,
            type: "efemeride",
            topic: efemeride.name,
          },
          message: candidate.generatedMessage,
          insight: efemeride.manual_data || candidate.customSeenkaData || efemeride.seenka_data_hint || candidate.matchedIndustryData || "",
          channel: candidate.channel,
          product: "seenka",
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Error al enviar")
      }

      updateCandidate(idx, { sending: false, sent: true, sendError: null })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al enviar el mensaje"
      updateCandidate(idx, { sending: false, sendError: message })
    }
  }

  const [sendingAll, setSendingAll] = useState(false)

  const sendAllMessages = async () => {
    setSendingAll(true)
    const readyToSend = candidates
      .map((c, i) => ({ ...c, idx: i }))
      .filter((c) => c.selected && c.generatedMessage && !c.sent && (
        (c.channel === "linkedin" && c.champion.linkedin_url) ||
        (c.channel === "email" && c.champion.email)
      ))

    for (const candidate of readyToSend) {
      await sendMessage(candidate.idx)
      // Wait between sends to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, candidate.channel === "linkedin" ? 3000 : 1000))
    }
    setSendingAll(false)
  }

  const readyToSendCount = candidates.filter(
    (c) => c.selected && c.generatedMessage && !c.sent && (
      (c.channel === "linkedin" && c.champion.linkedin_url) ||
      (c.channel === "email" && c.champion.email)
    )
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/efemerides")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{efemeride.name}</h1>
            <p className="text-sm text-muted-foreground">
              {eventDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
              {daysUntil > 0 ? ` - en ${daysUntil} días` : daysUntil === 0 ? " - Hoy" : ` - hace ${Math.abs(daysUntil)} días`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={generateAllMessages}
            disabled={selectedCount === 0 || generatingAll}
          >
            {generatingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generar mensajes ({selectedCount})
          </Button>
          {readyToSendCount > 0 && (
            <Button
              onClick={sendAllMessages}
              disabled={sendingAll}
              variant="default"
              className="gap-2"
            >
              {sendingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar mensajes ({readyToSendCount})
            </Button>
          )}
        </div>
      </div>

      {/* Industry data loaded */}
      {industryData.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Datos Seenka cargados por industria:</p>
            <div className="flex flex-wrap gap-2">
              {industryData.map((d) => (
                <Badge key={d.id} variant="outline">{d.industry}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No candidates */}
      {candidates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No hay champions que matcheen</h3>
            <p className="text-sm text-muted-foreground">
              No se encontraron champions que coincidan con los paises ({efemeride.countries.map((c) => EFEMERIDE_COUNTRY_LABELS[c] || c).join(", ")}) o industrias de esta efemeride.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Candidates list */}
      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={candidates.every((c) => c.selected)}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm font-medium">
                {candidates.length} champion{candidates.length > 1 ? "s" : ""} encontrado{candidates.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {candidates.map((candidate, idx) => {
            const ChannelIcon = getChannelIcon(candidate.channel)

            return (
              <Card key={candidate.champion.id} className={!candidate.selected ? "opacity-50" : undefined}>
                <CardContent className="p-4">
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={candidate.selected}
                      onCheckedChange={(checked) => updateCandidate(idx, { selected: !!checked })}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{candidate.champion.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.champion.role} @ {candidate.champion.company}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {candidate.clients.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {candidate.clients.map((c) => (
                              <Badge key={c.id} variant="outline" className="text-xs">
                                {c.client_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Badge className={`text-xs border ${getStageColor(candidate.stage)}`} variant="outline">
                          {getStageLabel(candidate.stage)}
                        </Badge>
                        {candidate.matchedIndustryData && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Sparkles className="h-2.5 w-2.5" />
                            Datos Seenka
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Channel selector */}
                    <div className="flex gap-1 shrink-0">
                      {(["linkedin", "email", "whatsapp"] as OutreachChannel[]).map((ch) => {
                        const Icon = getChannelIcon(ch)
                        return (
                          <Button
                            key={ch}
                            variant={candidate.channel === ch ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateCandidate(idx, { channel: ch, generatedMessage: null })}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="sr-only">{getChannelLabel(ch)}</span>
                          </Button>
                        )
                      })}
                    </div>

                    {/* Expand/collapse */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => updateCandidate(idx, { expanded: !candidate.expanded })}
                    >
                      {candidate.expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Expanded section */}
                  {candidate.expanded && (
                    <div className="mt-4 ml-8 space-y-3">
                      {/* Stage selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Etapa del contacto</Label>
                        <div className="flex gap-2">
                          {(["cold", "warm", "reengagement"] as OutreachStage[]).map((s) => (
                            <Button
                              key={s}
                              variant={candidate.stage === s ? "default" : "outline"}
                              size="sm"
                              className="text-xs"
                              onClick={() => updateCandidate(idx, { stage: s, generatedMessage: null })}
                            >
                              {getStageLabel(s)}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Matched industry data preview */}
                      {candidate.matchedIndustryData && (
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs font-medium mb-1">Dato Seenka (auto-match por industria):</p>
                          <p className="text-xs text-muted-foreground">{candidate.matchedIndustryData}</p>
                        </div>
                      )}

                      {/* Custom Seenka data override */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Dato Seenka personalizado (override)
                        </Label>
                        <Textarea
                          placeholder="Pegá acá un dato específico para este champion. Si lo dejás vacío, se usa el dato de la industria."
                          value={candidate.customSeenkaData}
                          onChange={(e) => updateCandidate(idx, { customSeenkaData: e.target.value, generatedMessage: null })}
                          rows={2}
                          className="text-xs"
                        />
                      </div>

                      {/* Generate single */}
                      <Button
                        size="sm"
                        onClick={() => generateMessage(idx)}
                        disabled={candidate.generating}
                      >
                        {candidate.generating ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-3.5 w-3.5" />
                        )}
                        Generar mensaje
                      </Button>
                    </div>
                  )}

                  {/* Generated message */}
                  {candidate.generatedMessage && (
                    <div className="mt-4 ml-8 rounded-md border bg-card p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{getChannelLabel(candidate.channel)}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => copyMessage(idx)}
                          >
                            {candidate.copied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {candidate.copied ? "Copiado" : "Copiar"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => generateMessage(idx)}
                            disabled={candidate.generating}
                          >
                            {candidate.generating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            Regenerar
                          </Button>
                          {!candidate.sent && (candidate.channel === "linkedin" || candidate.channel === "email") && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => sendMessage(idx)}
                              disabled={
                                candidate.sending ||
                                (candidate.channel === "linkedin" && !candidate.champion.linkedin_url) ||
                                (candidate.channel === "email" && !candidate.champion.email)
                              }
                            >
                              {candidate.sending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : candidate.channel === "email" ? (
                                <Mail className="h-3 w-3" />
                              ) : (
                                <Send className="h-3 w-3" />
                              )}
                              {candidate.sending
                                ? "Enviando..."
                                : candidate.channel === "email"
                                  ? `Enviar por Email${candidate.champion.email ? ` a ${candidate.champion.email}` : ""}`
                                  : "Enviar por LinkedIn"}
                            </Button>
                          )}
                          {candidate.sent && (
                            <Badge variant="default" className="text-xs gap-1 bg-green-600">
                              <Check className="h-3 w-3" />
                              Enviado{candidate.channel === "email" ? ` a ${candidate.champion.email}` : " por LinkedIn"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{candidate.generatedMessage}</p>
                      {candidate.sendError && (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {candidate.sendError}
                        </div>
                      )}
                      {candidate.channel === "linkedin" && !candidate.champion.linkedin_url && (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Este champion no tiene URL de LinkedIn cargada. Solo podés copiar el mensaje.
                        </div>
                      )}
                      {candidate.channel === "email" && !candidate.champion.email && (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Este champion no tiene email cargado. Editalo desde su perfil.
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
