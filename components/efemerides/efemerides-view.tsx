"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Globe,
  Factory,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Sparkles,
  Send,
  Users,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Building2,
  FileText,
  History,
  Loader2,
  Inbox,
} from "lucide-react"
import type { Efemeride } from "@/lib/types"
import { EFEMERIDE_COUNTRY_LABELS } from "@/lib/types"
import { AddEfemerideDialog } from "./add-efemeride-dialog"

type MatchCriteria = "industry" | "champion_type" | "keywords" | "interactions"

const MATCH_CRITERIA_CONFIG: Record<MatchCriteria, { label: string; description: string; icon: typeof Factory }> = {
  industry: { label: "Industria", description: "Match por industria/sector del cliente", icon: Factory },
  champion_type: { label: "Tipo champion", description: "Agencias matchean siempre por pais", icon: Building2 },
  keywords: { label: "Keywords", description: "Busca en headline/cargo del champion", icon: FileText },
  interactions: { label: "Historial", description: "Champions con interacciones previas", icon: History },
}

interface EfemeridesViewProps {
  efemerides: Efemeride[]
}

function getDaysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(dateStr + "T00:00:00")
  const diff = eventDate.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getStatusInfo(daysUntil: number): {
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
  icon: typeof CheckCircle2
} {
  if (daysUntil < 0) {
    return { label: "Pasada", variant: "secondary", icon: CheckCircle2 }
  }
  if (daysUntil <= 7) {
    return { label: "Esta semana", variant: "destructive", icon: AlertTriangle }
  }
  if (daysUntil <= 30) {
    return { label: "Próxima", variant: "default", icon: CalendarClock }
  }
  return { label: `En ${daysUntil} días`, variant: "outline", icon: Clock }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\/&]/g, " ").replace(/\s+/g, " ").trim()
}

function getIndustryKeywords(industry: string): string[] {
  const base = normalizeForMatch(industry)
  const map: Array<{ keys: string[]; keywords: string[] }> = [
    { keys: ["retail"], keywords: ["retail", "ecommerce", "e-commerce", "tienda", "store", "shop", "comercio"] },
    { keys: ["tecnolog", "tech"], keywords: ["tech", "tecnolog", "software", "hardware", "digital", "it "] },
    { keys: ["moda", "indumentaria"], keywords: ["moda", "fashion", "indumentaria", "ropa", "apparel", "textil"] },
    { keys: ["consumo masivo"], keywords: ["consumo masivo", "fmcg", "cpg", "consumer goods", "aliment"] },
    { keys: ["turismo", "hotel"], keywords: ["turismo", "hotel", "travel", "viaje", "tourism", "hospitality"] },
    { keys: ["automotriz", "auto"], keywords: ["auto", "car", "motor", "vehicul", "automotive"] },
    { keys: ["entretenimiento", "entertainment"], keywords: ["entertainment", "entretenimiento", "media", "streaming", "gaming"] },
    { keys: ["alimento", "bebida", "food"], keywords: ["alimento", "bebida", "food", "beverage", "gastro"] },
    { keys: ["farma", "salud", "pharma"], keywords: ["pharma", "farma", "salud", "health", "medical", "laboratorio"] },
    { keys: ["telecom", "telecomunic"], keywords: ["telecom", "telco", "celular", "mobile", "telefon"] },
    { keys: ["educaci", "education"], keywords: ["educación", "education", "universidad", "school", "capacitación"] },
    { keys: ["banca", "finanz", "financ"], keywords: ["banco", "bank", "finanz", "financ", "seguro", "insurance", "fintech", "credito", "tarjeta", "banca"] },
    { keys: ["oil", "gas", "petrol", "energy", "energía"], keywords: ["oil", "gas", "petrol", "energy", "energía", "combustible", "shell", "ypf"] },
    { keys: ["real estate", "inmobiliar"], keywords: ["inmobiliar", "real estate", "propiedad", "construc"] },
  ]
  for (const entry of map) {
    if (entry.keys.some((k) => base.includes(k))) return entry.keywords
  }
  return [base]
}

export function EfemeridesView({ efemerides: initialEfemerides }: EfemeridesViewProps) {
  const [efemerides, setEfemerides] = useState(initialEfemerides)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEfemeride, setEditingEfemeride] = useState<Efemeride | null>(null)
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming")
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [showCriteriaPanel, setShowCriteriaPanel] = useState(false)
  const [autoGeneratingId, setAutoGeneratingId] = useState<string | null>(null)
  const [autoGenerateResult, setAutoGenerateResult] = useState<Record<string, { message: string; success: boolean }>>({})
  const [triggeringId, setTriggeringId] = useState<string | null>(null)
  const [triggerResult, setTriggerResult] = useState<Record<string, { message: string; success: boolean }>>({})
  const [activeCriteria, setActiveCriteria] = useState<MatchCriteria[]>(["industry", "champion_type"])
  const [championMatches, setChampionMatches] = useState<
    Record<string, Array<{ champion_id: string; champion_name: string; client_name: string; matched_industria: string | null; match_type: "directo" | "parcial" | "pais" | "agencia" | "keyword" | "historial"; match_reason: string }>>
  >({})
  const router = useRouter()
  const supabase = createClient()

  const toggleCriteria = (c: MatchCriteria) => {
    setActiveCriteria((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])
  }

  // Load champion matches for all efemerides
  useEffect(() => {
    async function loadMatches() {
      // Get all champions with their clients, country, type, headline, role
      const { data: champions } = await supabase
        .from("champions")
        .select("id, name, country, champion_type, headline, role, company")
      const { data: clients } = await supabase
        .from("champion_clients")
        .select("champion_id, client_name, matched_sector, matched_industria")

      // Only load interactions if criteria is active
      let interactionsByChampion = new Map<string, number>()
      if (activeCriteria.includes("interactions")) {
        const { data: interactions } = await supabase
          .from("interactions")
          .select("champion_id")
        if (interactions) {
          for (const i of interactions) {
            interactionsByChampion.set(i.champion_id, (interactionsByChampion.get(i.champion_id) || 0) + 1)
          }
        }
      }

      if (!champions) return

      const clientsByChampion = new Map<string, typeof clients>()
      if (clients) {
        for (const c of clients) {
          if (!clientsByChampion.has(c.champion_id)) clientsByChampion.set(c.champion_id, [])
          clientsByChampion.get(c.champion_id)!.push(c)
        }
      }

      const countryNameToCode: Record<string, string> = {
        argentina: "AR", "ar": "AR",
        méxico: "MX", mexico: "MX", "mx": "MX",
        colombia: "CO", "co": "CO",
        chile: "CL", "cl": "CL",
        perú: "PE", peru: "PE", "pe": "PE",
        brasil: "BR", brazil: "BR", "br": "BR",
        "estados unidos": "US", "united states": "US", "us": "US",
      }

      // Agency-type champion types
      const agencyTypes = new Set(["creative", "media", "strategy"])

      const matches: typeof championMatches = {}

      for (const ef of efemerides) {
        matches[ef.id] = []
        const efIndustries = ef.industries.map((i) => i.toLowerCase())

        for (const champ of champions) {
          const champCountryCode = champ.country ? countryNameToCode[champ.country.toLowerCase()] || null : null
          const countryMatch = champCountryCode ? ef.countries.includes(champCountryCode) : false

          // Country is always required
          if (!countryMatch) continue

          const champClients = clientsByChampion.get(champ.id) || []

          // 1. Industry match (by client industry/sector OR by company name)
          if (activeCriteria.includes("industry") && efIndustries.length > 0) {
            let industryMatched = false

            // 1a. Match by client industry/sector
            if (champClients.length > 0) {
              for (const client of champClients) {
                const clientIndustry = client.matched_industria?.toLowerCase() || ""
                const clientSector = client.matched_sector?.toLowerCase() || ""

                if (clientIndustry && efIndustries.some((i) => clientIndustry.includes(i) || i.includes(clientIndustry))) {
                  matches[ef.id].push({
                    champion_id: champ.id,
                    champion_name: champ.name,
                    client_name: client.client_name,
                    matched_industria: client.matched_industria,
                    match_type: "directo",
                    match_reason: `Cliente ${client.client_name} en ${client.matched_industria}`,
                  })
                  industryMatched = true
                } else if (clientSector && efIndustries.some((i) => clientSector.includes(i) || i.includes(clientSector))) {
                  matches[ef.id].push({
                    champion_id: champ.id,
                    champion_name: champ.name,
                    client_name: client.client_name,
                    matched_industria: client.matched_sector,
                    match_type: "parcial",
                    match_reason: `Cliente ${client.client_name} en sector ${client.matched_sector}`,
                  })
                  industryMatched = true
                }
              }
            }

            // 1b. Match by company name (when no client match found)
            if (!industryMatched && champ.company) {
              const companyLower = champ.company.toLowerCase()
              for (const ind of efIndustries) {
                const keywords = getIndustryKeywords(ind)
                if (keywords.some((kw) => companyLower.includes(kw))) {
                  matches[ef.id].push({
                    champion_id: champ.id,
                    champion_name: champ.name,
                    client_name: champ.company,
                    matched_industria: ind,
                    match_type: "directo",
                    match_reason: `Empresa "${champ.company}" matchea con ${ind}`,
                  })
                  break
                }
              }
            }
          }

          // 2. Champion type: agency types match all industries in their country
          if (activeCriteria.includes("champion_type") && agencyTypes.has(champ.champion_type)) {
            matches[ef.id].push({
              champion_id: champ.id,
              champion_name: champ.name,
              client_name: champ.company || "-",
              matched_industria: null,
              match_type: "agencia",
              match_reason: `Tipo ${champ.champion_type} en ${champ.company || "agencia"} (multi-cliente)`,
            })
          }

          // 3. Keywords in headline/role/company
          if (activeCriteria.includes("keywords") && efIndustries.length > 0) {
            const searchText = `${champ.headline || ""} ${champ.role || ""} ${champ.company || ""}`.toLowerCase()
            for (const ind of efIndustries) {
              // Also check common related words
              const industryKeywords = getIndustryKeywords(ind)
              if (industryKeywords.some((kw) => searchText.includes(kw))) {
                matches[ef.id].push({
                  champion_id: champ.id,
                  champion_name: champ.name,
                  client_name: "-",
                  matched_industria: ind,
                  match_type: "keyword",
                  match_reason: `Keyword en headline/cargo: "${champ.headline || champ.role || ""}"`,
                })
                break
              }
            }
          }

          // 4. Interaction history
          if (activeCriteria.includes("interactions")) {
            const count = interactionsByChampion.get(champ.id) || 0
            if (count > 0) {
              matches[ef.id].push({
                champion_id: champ.id,
                champion_name: champ.name,
                client_name: "-",
                matched_industria: null,
                match_type: "historial",
                match_reason: `${count} interaccion${count > 1 ? "es" : ""} previa${count > 1 ? "s" : ""}`,
              })
            }
          }
        }

        // Deduplicate by champion_id, keep best match_type
        const seen = new Map<string, (typeof matches)[string][0]>()
        const priority: Record<string, number> = { directo: 0, parcial: 1, agencia: 2, keyword: 3, historial: 4, pais: 5 }
        for (const m of matches[ef.id]) {
          const existing = seen.get(m.champion_id)
          if (!existing || (priority[m.match_type] ?? 99) < (priority[existing.match_type] ?? 99)) {
            seen.set(m.champion_id, m)
          }
        }
        matches[ef.id] = Array.from(seen.values()).sort((a, b) => (priority[a.match_type] ?? 99) - (priority[b.match_type] ?? 99))
      }

      setChampionMatches(matches)
    }
    loadMatches()
  }, [efemerides, activeCriteria])

  const filtered = useMemo(() => {
    return efemerides.filter((e) => {
      const days = getDaysUntil(e.event_date)
      if (filter === "upcoming") return days >= 0
      if (filter === "past") return days < 0
      return true
    })
  }, [efemerides, filter])

  const upcoming = useMemo(
    () => efemerides.filter((e) => getDaysUntil(e.event_date) >= 0 && getDaysUntil(e.event_date) <= 45),
    [efemerides]
  )

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("efemerides").update({ is_active: isActive }).eq("id", id)
    setEfemerides((prev) => prev.map((e) => (e.id === id ? { ...e, is_active: isActive } : e)))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar esta efeméride?")) return
    await supabase.from("efemerides").delete().eq("id", id)
    setEfemerides((prev) => prev.filter((e) => e.id !== id))
  }

  const handleEdit = (efemeride: Efemeride) => {
    setEditingEfemeride(efemeride)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingEfemeride(null)
    setDialogOpen(true)
  }

  const handleAutoGenerate = async (efemerideId: string) => {
    setAutoGeneratingId(efemerideId)
    setAutoGenerateResult((prev) => {
      const next = { ...prev }
      delete next[efemerideId]
      return next
    })
    try {
      const res = await fetch("/api/outreach/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efemeride_id: efemerideId }),
      })
      const data = await res.json()
      if (res.ok) {
        setAutoGenerateResult((prev) => ({
          ...prev,
          [efemerideId]: { message: data.message, success: true },
        }))
      } else {
        setAutoGenerateResult((prev) => ({
          ...prev,
          [efemerideId]: { message: data.error || "Error al generar", success: false },
        }))
      }
    } catch {
      setAutoGenerateResult((prev) => ({
        ...prev,
        [efemerideId]: { message: "Error de conexión", success: false },
      }))
    } finally {
      setAutoGeneratingId(null)
    }
  }

  const handleTriggerGaston = async (efemerideId: string) => {
    setTriggeringId(efemerideId)
    setTriggerResult((prev) => { const next = { ...prev }; delete next[efemerideId]; return next })
    try {
      const res = await fetch(`/api/efemerides/${efemerideId}/trigger-agent`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setTriggerResult((prev) => ({ ...prev, [efemerideId]: { message: `${data.matched_count ?? 0} mensajes generados`, success: true } }))
        router.push("/interactions")
      } else {
        setTriggerResult((prev) => ({ ...prev, [efemerideId]: { message: data.error || "Error", success: false } }))
      }
    } catch {
      setTriggerResult((prev) => ({ ...prev, [efemerideId]: { message: "Error de conexión", success: false } }))
    } finally {
      setTriggeringId(null)
    }
  }

  const handleSaved = () => {
    setDialogOpen(false)
    setEditingEfemeride(null)
    router.refresh()
    // Optimistic: reload from server
    supabase
      .from("efemerides")
      .select("*")
      .order("event_date", { ascending: true })
      .then(({ data }) => {
        if (data) setEfemerides(data)
      })
  }

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {upcoming.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {upcoming.length} efeméride{upcoming.length > 1 ? "s" : ""} próxima{upcoming.length > 1 ? "s" : ""} en
                los próximos 45 días
              </p>
              <p className="text-xs text-muted-foreground">
                {upcoming.map((e) => e.name).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={filter === "upcoming" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("upcoming")}
            >
              Próximas
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              Todas
            </Button>
            <Button
              variant={filter === "past" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("past")}
            >
              Pasadas
            </Button>
            <div className="mx-2 h-6 w-px bg-border" />
            <Button
              variant={showCriteriaPanel ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowCriteriaPanel(!showCriteriaPanel)}
              className="gap-1.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Criterios de match
              {activeCriteria.length > 0 && (
                <Badge variant="default" className="ml-1 text-[10px] px-1.5 py-0">
                  {activeCriteria.length}
                </Badge>
              )}
            </Button>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Efeméride
          </Button>
        </div>

        {/* Match criteria panel */}
        {showCriteriaPanel && (
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-medium">
                Selecciona los criterios para matchear champions con efemérides (el pais siempre es obligatorio):
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.entries(MATCH_CRITERIA_CONFIG) as [MatchCriteria, typeof MATCH_CRITERIA_CONFIG[MatchCriteria]][]).map(([key, config]) => {
                  const Icon = config.icon
                  const isActive = activeCriteria.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCriteria(key)}
                      className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <div className={`h-3 w-3 rounded-full border-2 ${isActive ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{config.label}</p>
                        <p className="text-[11px] leading-tight text-muted-foreground">{config.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <CalendarDays className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No hay efemérides</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {filter === "upcoming"
                ? "No hay efemérides próximas. Creá una para empezar a generar mensajes con contexto."
                : "No hay efemérides registradas."}
            </p>
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Crear efeméride
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((efemeride) => {
            const daysUntil = getDaysUntil(efemeride.event_date)
            const status = getStatusInfo(daysUntil)
            const StatusIcon = status.icon
            const eventDate = new Date(efemeride.event_date + "T00:00:00")

            return (
              <Card
                key={efemeride.id}
                className={!efemeride.is_active ? "opacity-60" : undefined}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base leading-tight">{efemeride.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {eventDate.toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge variant={status.variant} className="shrink-0 gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {efemeride.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{efemeride.description}</p>
                  )}

                  {/* Countries */}
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex flex-wrap gap-1">
                      {efemeride.countries.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">
                          {EFEMERIDE_COUNTRY_LABELS[c] || c}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Industries */}
                  {efemeride.industries.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Factory className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {efemeride.industries.map((ind) => (
                          <Badge key={ind} variant="secondary" className="text-xs">
                            {ind}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seenka data hint */}
                  {efemeride.seenka_data_hint && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Dato Seenka:</span> {efemeride.seenka_data_hint}
                      </p>
                    </div>
                  )}

                  {/* Reminder */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Recordatorio {efemeride.reminder_days_before} días antes
                  </div>

                  {/* Champion matches */}
                  {(() => {
                    const matches = championMatches[efemeride.id] || []
                    const isExpanded = expandedCard === efemeride.id

                    // Group by match type for summary
                    const groups: Record<string, number> = {}
                    for (const m of matches) {
                      groups[m.match_type] = (groups[m.match_type] || 0) + 1
                    }

                    const typeLabels: Record<string, string> = {
                      directo: "industria",
                      parcial: "sector",
                      agencia: "agencia",
                      keyword: "keyword",
                      historial: "historial",
                      pais: "pais",
                    }
                    const typeVariants: Record<string, "default" | "secondary" | "outline"> = {
                      directo: "default",
                      parcial: "secondary",
                      agencia: "secondary",
                      keyword: "outline",
                      historial: "outline",
                      pais: "outline",
                    }

                    if (matches.length === 0 && activeCriteria.length > 0) {
                      return (
                        <div className="rounded-md border border-dashed p-2 text-center">
                          <p className="text-xs text-muted-foreground">Sin champions que matcheen</p>
                        </div>
                      )
                    }

                    if (activeCriteria.length === 0) {
                      return (
                        <div className="rounded-md border border-dashed p-2 text-center">
                          <p className="text-xs text-muted-foreground">Selecciona criterios de match arriba</p>
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-2">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
                          onClick={() => setExpandedCard(isExpanded ? null : efemeride.id)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">{matches.length} champion{matches.length > 1 ? "s" : ""}</span>
                            {Object.entries(groups).map(([type, count]) => (
                              <Badge key={type} variant={typeVariants[type] || "outline"} className="text-[10px] px-1.5 py-0">
                                {count} {typeLabels[type] || type}
                              </Badge>
                            ))}
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>

                        {isExpanded && (
                          <div className="max-h-56 overflow-y-auto rounded-md border">
                            <div className="divide-y">
                              {matches.map((m) => (
                                <button
                                  type="button"
                                  key={`${m.champion_id}-${m.match_type}`}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                                  onClick={() => router.push(`/champions/${m.champion_id}`)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{m.champion_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {m.match_reason}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={typeVariants[m.match_type] || "outline"}
                                    className="text-[10px] shrink-0"
                                  >
                                    {typeLabels[m.match_type] || m.match_type}
                                  </Badge>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Auto-generate result */}
                  {autoGenerateResult[efemeride.id] && (
                    <div className={`rounded-md p-2 text-xs ${autoGenerateResult[efemeride.id].success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                      {autoGenerateResult[efemeride.id].message}
                      {autoGenerateResult[efemeride.id].success && (
                        <button
                          type="button"
                          className="ml-2 underline font-medium"
                          onClick={() => router.push("/bandeja")}
                        >
                          Ver bandeja
                        </button>
                      )}
                    </div>
                  )}

                  {/* Outreach buttons */}
                  {daysUntil >= -7 && efemeride.is_active && (
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full gap-2"
                        disabled={triggeringId === efemeride.id}
                        onClick={() => handleTriggerGaston(efemeride.id)}
                      >
                        {triggeringId === efemeride.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {triggeringId === efemeride.id ? "Gastón trabajando..." : "Triggear Gastón"}
                      </Button>
                      {triggerResult[efemeride.id] && (
                        <p className={`text-xs ${triggerResult[efemeride.id].success ? "text-green-600" : "text-destructive"}`}>
                          {triggerResult[efemeride.id].message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={efemeride.is_active}
                        onCheckedChange={(checked) => handleToggleActive(efemeride.id, checked)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {efemeride.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(efemeride)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(efemeride.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Eliminar</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AddEfemerideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        efemeride={editingEfemeride}
        onSaved={handleSaved}
      />
    </div>
  )
}
