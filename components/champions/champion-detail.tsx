"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { Champion, Trigger, Interaction, ChampionStatus, GeneratedInsight, Company, ChampionType } from "@/lib/types"
import { SequenceTracker } from "@/components/champions/sequence-tracker"
import { ChampionSequenceStatus } from "@/components/champions/champion-sequence-status"
import { ChampionProfileHeader } from "@/components/champions/champion-profile-header"
import { STATUS_LABELS, LEVEL_LABELS, TRIGGER_TYPE_LABELS, SEVERITY_LABELS, CHANNEL_LABELS, CHAMPION_TYPE_LABELS, CHAMPION_TYPE_SEENKA_PROMPTS } from "@/lib/types"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  ExternalLink,
  Zap,
  MessageSquare,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Send,
  User,
  Building,
  GraduationCap,
  Users,
  Globe,
  Package,
  Webhook,
  RefreshCw,
  Quote,
  TrendingUp,
  UserPlus,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"

interface ChampionDetailProps {
  champion: Champion
  triggers: Trigger[]
  interactions: Interaction[]
}

export function ChampionDetail({ champion, triggers, interactions }: ChampionDetailProps) {
  const [status, setStatus] = useState<ChampionStatus>(champion.status)
  const [isUpdating, setIsUpdating] = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null)
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedInsight, setGeneratedInsight] = useState<GeneratedInsight | null>(null)
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingToMake, setIsSendingToMake] = useState(false)
  const [makeError, setMakeError] = useState<string | null>(null)
  const [makeSent, setMakeSent] = useState(false)
  const [isRefreshingLinkedIn, setIsRefreshingLinkedIn] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isEnrichingSocial, setIsEnrichingSocial] = useState(false)
  const [fieldConfigs, setFieldConfigs] = useState<Array<{linkedinField: string, dbField: string, visible: boolean}>>([])
  const [companyData, setCompanyData] = useState<Company | null>(null)
  const [isAnalyzingCompany, setIsAnalyzingCompany] = useState(false)
  const [seenkaAIDialogOpen, setSeenkaAIDialogOpen] = useState(false)
  const [seenkaAIResponse, setSeenkaAIResponse] = useState(champion.seenka_ai_insight || "")
  const [isSavingSeenkaInsight, setIsSavingSeenkaInsight] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [championClients, setChampionClients] = useState<Array<{id: string, client_name: string, matched_entidad?: string, matched_sector?: string, matched_industria?: string}>>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: champion.name || "",
    email: champion.email || "",
    role: champion.role || "",
    company: champion.company || "",
    country: champion.country || "",
    headline: champion.headline || "",
    linkedin_url: champion.linkedin_url || "",
    champion_type: champion.champion_type || "marketing",
    champion_level: champion.champion_level || "medium",
  })
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [clientMatchPreview, setClientMatchPreview] = useState<{ found: boolean; entidad?: string; sector?: string; industria?: string; id?: string; score?: number } | null>(null)
  const [isSearchingClient, setIsSearchingClient] = useState(false)
  const [isSavingClient, setIsSavingClient] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Cargar configuración de campos visibles y datos de empresa
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Cargar configuración de campos
      const { data: settings } = await supabase
        .from("settings")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "linkedin_field_config")
        .single()

      if (settings?.value) {
        setFieldConfigs(JSON.parse(settings.value))
      }

      // Cargar clientes del champion
      const { data: clients } = await supabase
        .from("champion_clients")
        .select("id, client_name, matched_entidad, matched_sector, matched_industria")
        .eq("champion_id", champion.id)
      if (clients && clients.length > 0) {
        setChampionClients(clients)
      }

      // Cargar datos de la empresa si existe company_id
      if (champion.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("*")
          .eq("id", champion.company_id)
          .single()

        if (company) {
          setCompanyData(company)
        }
      } else if (champion.company && !isAnalyzingCompany) {
        // Si tiene empresa pero no tiene company_id, analizar automáticamente
        analyzeCompanyAutomatically()
      }
    }
    loadData()
  }, [supabase, champion.company_id, champion.company])

  // Función para analizar empresa automáticamente
  const analyzeCompanyAutomatically = async () => {
    if (!champion.company || isAnalyzingCompany) return
    
    setIsAnalyzingCompany(true)

    try {
      const response = await fetch("/api/ai/analyze-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: champion.company,
          champion_role: champion.role,
          champion_headline: champion.headline
        })
      })

      if (!response.ok) return

      const { company } = await response.json()

      if (company?.id) {
        await supabase
          .from("champions")
          .update({ company_id: company.id })
          .eq("id", champion.id)

        setCompanyData(company)
      }
    } catch (error) {
      console.error("Error auto-analyzing company:", error)
    } finally {
      setIsAnalyzingCompany(false)
    }
  }

  const handleSaveEdit = async () => {
    setIsSavingEdit(true)
    try {
      const { error } = await supabase
        .from("champions")
        .update({
          name: editForm.name,
          email: editForm.email || null,
          role: editForm.role || null,
          company: editForm.company || null,
          country: editForm.country || null,
          headline: editForm.headline || null,
          linkedin_url: editForm.linkedin_url || null,
          champion_type: editForm.champion_type,
          champion_level: editForm.champion_level,
        })
        .eq("id", champion.id)

      if (error) throw error
      setEditDialogOpen(false)
      router.refresh()
    } catch (err) {
      console.error("Error al guardar:", err)
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Buscar en nomenclador mientras escribe (debounced)
  const searchClientDebounced = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleClientNameChange = (value: string) => {
    setNewClientName(value)
    setClientMatchPreview(null)
    if (searchClientDebounced.current) clearTimeout(searchClientDebounced.current)
    if (value.trim().length < 2) return
    setIsSearchingClient(true)
    searchClientDebounced.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/nomenclador/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_name: value.trim() }),
        })
        if (res.ok) {
          const data = await res.json()
          setClientMatchPreview(data)
        }
      } catch {}
      setIsSearchingClient(false)
    }, 500)
  }

  const handleAddClient = async () => {
    if (!newClientName.trim()) return
    setIsSavingClient(true)
    try {
      const { data, error } = await supabase
        .from("champion_clients")
        .insert({
          champion_id: champion.id,
          client_name: newClientName.trim(),
          nomenclador_id: clientMatchPreview?.found ? clientMatchPreview.id : null,
          matched_entidad: clientMatchPreview?.found ? clientMatchPreview.entidad : null,
          matched_sector: clientMatchPreview?.found ? clientMatchPreview.sector : null,
          matched_industria: clientMatchPreview?.found ? clientMatchPreview.industria : null,
          match_score: clientMatchPreview?.found ? clientMatchPreview.score : null,
        })
        .select("id, client_name, matched_entidad, matched_sector, matched_industria")
        .single()

      if (error) throw error
      if (data) {
        setChampionClients((prev) => [...prev, data])
        setNewClientName("")
        setClientMatchPreview(null)
        setShowAddClient(false)
      }
    } catch (err) {
      console.error("Error al agregar cliente:", err)
    } finally {
      setIsSavingClient(false)
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    try {
      const { error } = await supabase
        .from("champion_clients")
        .delete()
        .eq("id", clientId)

      if (error) throw error
      setChampionClients((prev) => prev.filter((c) => c.id !== clientId))
    } catch (err) {
      console.error("Error al eliminar cliente:", err)
    }
  }

  const handleStatusChange = async (newStatus: ChampionStatus) => {
    setIsUpdating(true)
    
    const { error } = await supabase
      .from("champions")
      .update({ status: newStatus })
      .eq("id", champion.id)

    if (!error) {
      setStatus(newStatus)
      router.refresh()
    }
    setIsUpdating(false)
  }

  const handleRefreshLinkedIn = async () => {
    if (!champion.linkedin_url) return
    
    setIsRefreshingLinkedIn(true)
    setRefreshError(null)

    try {
      // Marcar como enriching inmediatamente
      await supabase
        .from("champions")
        .update({ enrichment_status: "enriching" })
        .eq("id", champion.id)

      router.refresh()

      // Disparar enriquecimiento completo en background
      const response = await fetch("/api/champions/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champion_id: champion.id }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Error en el enriquecimiento")
      }

      router.refresh()
    } catch (error) {
      console.error("Error refreshing LinkedIn:", error)
      setRefreshError(error instanceof Error ? error.message : "Error desconocido")
    } finally {
      setIsRefreshingLinkedIn(false)
    }
  }

  const handleEnrichSocial = async () => {
    setIsEnrichingSocial(true)
    try {
      const response = await fetch("/api/ai/enrich-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ championId: champion.id }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Error buscando redes sociales")
      }

      router.refresh()
    } catch (error) {
      console.error("Error enriching social:", error)
      alert(error instanceof Error ? error.message : "Error buscando redes sociales")
    } finally {
      setIsEnrichingSocial(false)
    }
  }

  // Cambiar tipo de champion
  const handleChangeChampionType = async (newType: ChampionType) => {
    const { error } = await supabase
      .from("champions")
      .update({ champion_type: newType })
      .eq("id", champion.id)

    if (!error) {
      router.refresh()
    }
  }

  // Generar prompt para Seenka AI según tipo de champion
  const generateSeenkaAIPrompt = () => {
    const industry = companyData?.industry || champion.industry || "No especificada"
    const sector = companyData?.sector || "No especificado"
    const company = champion.company || "No especificada"
    const championType = champion.champion_type || "other"
    
    const promptFn = CHAMPION_TYPE_SEENKA_PROMPTS[championType]
    return promptFn({ industry, sector, company })
  }

  const handleCopySeenkaPrompt = async () => {
    const prompt = generateSeenkaAIPrompt()
    await navigator.clipboard.writeText(prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const handleOpenSeenkaAI = () => {
    handleCopySeenkaPrompt()
    window.open("https://chatgpt.com/g/g-yI8uzYgkH-seenka", "_blank")
  }

  // MCP auto-query states
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpResult, setMcpResult] = useState("")
  const [mcpError, setMcpError] = useState("")

  const querySeenkaMCP = function() {
    setMcpLoading(true)
    setMcpResult("")
    setMcpError("")
    
    const brandNames = championClients.map(function(c) { return c.client_name }).filter(Boolean)
    const sector = championClients[0]?.matched_sector || ""
    
    fetch("/api/seenka-mcp/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_names: brandNames.length > 0 ? brandNames : undefined,
        sector: brandNames.length === 0 && sector ? sector : undefined,
        country: champion.country || "argentina"
      })
    })
    .then(function(res) { return res.json() })
    .then(function(data) {
      if (data.error) {
        setMcpError(data.error)
      } else if (data.text) {
        setMcpResult(data.text)
        setSeenkaAIResponse(data.text)
      } else {
        setMcpResult("No se encontraron datos.")
      }
    })
    .catch(function(err) { setMcpError(String(err)) })
    .finally(function() { setMcpLoading(false) })
  }

  // Auto-query when dialog opens
  useEffect(function() {
    if (seenkaAIDialogOpen && !mcpResult && !mcpLoading) {
      querySeenkaMCP()
    }
  }, [seenkaAIDialogOpen])


  const handleSaveSeenkaInsight = async () => {
    if (!seenkaAIResponse.trim()) return
    
    setIsSavingSeenkaInsight(true)
    try {
      // Guardar el insight en el champion
      const { error } = await supabase
        .from("champions")
        .update({ seenka_ai_insight: seenkaAIResponse })
        .eq("id", champion.id)

      if (error) throw error

      // Crear un trigger automáticamente para poder generar el mensaje
      const industry = companyData?.industry || champion.industry || "la industria"
      const { error: triggerError } = await supabase
        .from("triggers")
        .insert({
          champion_id: champion.id,
          type: "data_seenka",
          topic: `Insight de ${industry}`,
          source_text: seenkaAIResponse,
          severity: "high",
          is_worth_contacting: true,
        })

      if (triggerError) {
        console.error("Error creating trigger:", triggerError)
      }
      
      setSeenkaAIDialogOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Error saving Seenka AI insight:", error)
    } finally {
      setIsSavingSeenkaInsight(false)
    }
  }

  const handleGenerateInsight = async () => {
    if (!selectedTrigger) return
    
    setIsGenerating(true)
    setGeneratedInsight(null)

    try {
      const response = await fetch("/api/ai/generate-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_text: selectedTrigger.source_text,
          trigger_topic: selectedTrigger.topic,
          champion_name: champion.name,
          champion_role: champion.role,
          champion_company: champion.company,
          champion_industry: companyData?.industry || champion.industry,
          champion_sector: companyData?.sector,
          seenka_ai_insight: champion.seenka_ai_insight,
          company_pain_points: companyData?.pain_points,
          company_sales_angle: companyData?.sales_angle,
          company_seenka_products: companyData?.seenka_products,
          channel,
        }),
      })

      if (!response.ok) throw new Error("Error generating insight")

      const data = await response.json()
      setGeneratedInsight(data)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyMessage = async () => {
    if (!generatedInsight) return
    await navigator.clipboard.writeText(generatedInsight.suggested_message)
    setCopiedMessage(true)
    setTimeout(() => setCopiedMessage(false), 2000)
  }

  const handleSaveInteraction = async () => {
    if (!generatedInsight || !selectedTrigger) return
    
    setIsSaving(true)
    const supabase = createClient()

    const { error } = await supabase.from("interactions").insert({
      champion_id: champion.id,
      trigger_id: selectedTrigger.id,
      channel,
      message: generatedInsight.suggested_message,
      insight: generatedInsight.insight,
    })

    if (!error) {
      // Update champion status
      await supabase
        .from("champions")
        .update({ status: "contacted" })
        .eq("id", champion.id)

      setGenerateDialogOpen(false)
      setGeneratedInsight(null)
      setSelectedTrigger(null)
      router.refresh()
    }

    setIsSaving(false)
  }

  const handleSendToMake = async () => {
    if (!generatedInsight || !selectedTrigger) return
    
    setIsSendingToMake(true)
    setMakeError(null)

    try {
      const response = await fetch("/api/outreach/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion,
          trigger: selectedTrigger,
          message: generatedInsight.suggested_message,
          insight: generatedInsight.insight,
          channel,
          product: generatedInsight.recommended_product
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al enviar")
      }

      setMakeSent(true)
      setTimeout(() => {
        setGenerateDialogOpen(false)
        setGeneratedInsight(null)
        setSelectedTrigger(null)
        setMakeSent(false)
        router.refresh()
      }, 2000)
    } catch (err) {
      setMakeError(err instanceof Error ? err.message : "Error al enviar a Make")
    } finally {
      setIsSendingToMake(false)
    }
  }

  const worthContactingTriggers = triggers.filter((t) => t.is_worth_contacting)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <Link
          href="/champions"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Champions
        </Link>
      </div>

      <ChampionProfileHeader
        champion={champion}
        status={status}
        onStatusChange={function(v) { handleStatusChange(v) }}
        isUpdating={isUpdating}
        onEdit={function() { setEditDialogOpen(true) }}
        onRefreshLinkedIn={handleRefreshLinkedIn}
        isRefreshingLinkedIn={isRefreshingLinkedIn}
        onOpenSeenka={function() { setSeenkaAIDialogOpen(true) }}
        onGenerateMessage={function() { setGenerateDialogOpen(true) }}
        hasCompanyData={!!companyData}
        hasTriggers={triggers.length > 0}
        onEnrichSocial={handleEnrichSocial}
        isEnrichingSocial={isEnrichingSocial}
      />

      {/* Brief de prospección */}
      {champion.ai_profile_summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-primary mb-1">Brief de prospección</p>
                <p className="text-sm text-foreground leading-relaxed">{champion.ai_profile_summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enrichment status banner */}
      {champion.enrichment_status === "enriching" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Enriqueciendo perfil... Esto puede tomar unos segundos. Los datos se actualizan automáticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {champion.enrichment_status === "error" && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-destructive shrink-0" />
              <p className="text-sm text-destructive">
                Error en el enriquecimiento: {champion.enrichment_error || "Error desconocido"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshLinkedIn}
                disabled={isRefreshingLinkedIn}
                className="ml-auto shrink-0"
              >
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="triggers">
            <Zap className="mr-2 h-4 w-4" />
            Triggers ({triggers.length})
          </TabsTrigger>
          <TabsTrigger value="interactions">
            <MessageSquare className="mr-2 h-4 w-4" />
            Interacciones ({interactions.length})
          </TabsTrigger>
          <TabsTrigger value="sequence">
            <GitBranch className="mr-2 h-4 w-4" />
            Secuencia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda — Info principal (2/3) */}
            <div className="lg:col-span-2 space-y-6">

              {/* Sobre — headline + summary */}
              {(champion.headline || champion.summary) && (
                <Card>
                  <CardContent className="pt-5 space-y-2">
                    {champion.headline && (
                      <p className="text-sm font-medium text-foreground">{champion.headline}</p>
                    )}
                    {champion.summary && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{champion.summary}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Experiencia laboral */}
              {champion.experiences && champion.experiences.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      Experiencia
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0">
                    {champion.experiences
                      .filter(exp => exp.company || exp.title)
                      .map((exp, i, arr) => (
                      <div key={i} className={`flex gap-4 py-3 ${i < arr.length - 1 ? "border-b" : ""}`}>
                        <div className="flex flex-col items-center pt-0.5">
                          <div className={`h-2.5 w-2.5 rounded-full ${exp.is_current ? "bg-primary" : "bg-muted-foreground/30"}`} />
                          {i < arr.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{exp.title || exp.company}</p>
                          {exp.title && exp.company && (
                            <p className="text-sm text-muted-foreground">{exp.company}</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {(exp.start_date || exp.end_date) && (
                              <p className="text-xs text-muted-foreground">
                                {exp.start_date || "?"} - {exp.is_current ? "Presente" : exp.end_date || "?"}
                              </p>
                            )}
                            {exp.location && (
                              <p className="text-xs text-muted-foreground">
                                · {exp.location}
                              </p>
                            )}
                          </div>
                          {exp.description && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{exp.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Educación */}
              {champion.educations && champion.educations.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      Educacion
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0">
                    {champion.educations.map((edu, i, arr) => (
                      <div key={i} className={`py-3 ${i < arr.length - 1 ? "border-b" : ""}`}>
                        <p className="font-medium text-sm">{edu.school}</p>
                        {edu.degree && (
                          <p className="text-sm text-muted-foreground">{edu.degree}{edu.field_of_study ? ` · ${edu.field_of_study}` : ""}</p>
                        )}
                        {(edu.start_date || edu.end_date) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {edu.start_date || "?"} - {edu.end_date || "?"}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Análisis de la Empresa */}
              {companyData && (companyData.pain_points?.length || companyData.sales_angle) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      Análisis Comercial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {companyData.pain_points && companyData.pain_points.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Pain Points</p>
                        <div className="space-y-1.5">
                          {companyData.pain_points.map((point, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span className="text-primary mt-0.5">•</span>
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {companyData.sales_angle && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Angulo de venta</p>
                        <p className="text-sm bg-primary/5 border border-primary/10 p-3 rounded-lg">{companyData.sales_angle}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Columna derecha — Sidebar (1/3) */}
            <div className="space-y-6">

              {/* Datos de contacto */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Contacto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {champion.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">Email</span>
                      <a href={`mailto:${champion.email}`} className="text-primary hover:underline truncate">{champion.email}</a>
                    </div>
                  )}
                  {champion.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">Tel</span>
                      <span className="truncate">{champion.phone}</span>
                    </div>
                  )}
                  {champion.linkedin_url && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">LinkedIn</span>
                      <a href={champion.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        Perfil
                        <ExternalLink className="inline ml-1 h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {champion.website_url && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">Web</span>
                      <a href={champion.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{champion.website_url}</a>
                    </div>
                  )}
                  {champion.country && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">País</span>
                      <span>{champion.country}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Redes sociales */}
              {champion.social_profiles && Object.keys(champion.social_profiles).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Redes Sociales</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(champion.social_profiles).map(([platform, data]: [string, any]) => (
                      <a
                        key={platform}
                        href={data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm group"
                      >
                        <span className="capitalize font-medium w-20">{platform === "twitterx" ? "Twitter/X" : platform}</span>
                        <span className="text-muted-foreground truncate flex-1">{data.handle || data.url.split("/").pop()}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Empresa */}
              {companyData && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      Empresa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="font-medium text-sm">{companyData.name || champion.company}</p>
                    {companyData.industry && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-16 shrink-0">Industria</span>
                        <span>{companyData.industry}</span>
                      </div>
                    )}
                    {companyData.sector && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-16 shrink-0">Sector</span>
                        <span>{companyData.sector}</span>
                      </div>
                    )}
                    {companyData.size && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-16 shrink-0">Tamaño</span>
                        <Badge variant="secondary" className="text-xs">{companyData.size}</Badge>
                      </div>
                    )}
                    {companyData.description && (
                      <p className="text-xs text-muted-foreground pt-1 border-t">{companyData.description}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Clientes / Marcas */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Clientes / Marcas
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowAddClient(!showAddClient)}
                  >
                    {showAddClient ? "Cancelar" : <><Plus className="h-3 w-3 mr-1" />Agregar</>}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {showAddClient && (
                    <div className="rounded-lg border border-dashed p-3 space-y-2">
                      <div className="relative">
                        <Input
                          placeholder="Ej: Coca-Cola"
                          value={newClientName}
                          onChange={(e) => handleClientNameChange(e.target.value)}
                          autoFocus
                          className="h-8 text-sm"
                        />
                        {isSearchingClient && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      {clientMatchPreview !== null && (
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${clientMatchPreview.found ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          {clientMatchPreview.found ? (
                            <span>{clientMatchPreview.entidad} · {clientMatchPreview.sector}{clientMatchPreview.industria ? ` · ${clientMatchPreview.industria}` : ""}</span>
                          ) : (
                            <span>Sin match en nomenclador</span>
                          )}
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs w-full"
                        onClick={handleAddClient}
                        disabled={isSavingClient || !newClientName.trim()}
                      >
                        {isSavingClient && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Guardar
                      </Button>
                    </div>
                  )}
                  {championClients.length > 0 ? (
                    <div className="space-y-1.5">
                      {championClients.map((client) => (
                        <div key={client.id} className="flex items-center justify-between py-1.5 group">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate">{client.client_name}</span>
                            {client.matched_sector && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">{client.matched_sector}</Badge>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteClient(client.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !showAddClient && (
                    <p className="text-xs text-muted-foreground">
                      Sin clientes cargados
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Idiomas */}
              {champion.languages && champion.languages.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Idiomas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {champion.languages.map((lang, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{lang}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Perfiles similares */}
              {champion.similar_profiles && champion.similar_profiles.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Perfiles Similares
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {champion.similar_profiles.slice(0, 5).map((profile, i) => (
                      <a
                        key={i}
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 py-1.5 text-sm hover:text-primary transition-colors group"
                      >
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                          {profile.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{profile.name}</p>
                          {profile.headline && (
                            <p className="text-[11px] text-muted-foreground truncate">{profile.headline}</p>
                          )}
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Empty state */}
          {!champion.headline && !champion.summary && !champion.experiences?.length && !champion.educations?.length && !companyData && !champion.social_profiles && (
            <Card className="border-dashed mt-6">
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay información enriquecida para este champion.
                <br />
                <span className="text-sm">Usá "Actualizar LinkedIn" para obtener más datos.</span>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="triggers" className="space-y-4">
          {triggers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay triggers registrados para este champion.
              </CardContent>
            </Card>
          ) : (
            triggers.map((trigger) => (
              <Card key={trigger.id} className={trigger.is_worth_contacting ? "border-accent/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {trigger.topic || "Sin tema"}
                      </CardTitle>
                      <CardDescription>
                        {new Date(trigger.created_at).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {TRIGGER_TYPE_LABELS[trigger.type]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          trigger.severity === "high"
                            ? "border-destructive/50 text-destructive"
                            : trigger.severity === "medium"
                            ? "border-accent/50 text-accent"
                            : ""
                        }
                      >
                        {SEVERITY_LABELS[trigger.severity]}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {trigger.source_text}
                  </p>
                  {trigger.is_worth_contacting && (
                    <Badge className="mt-3 bg-chart-2/20 text-chart-2">
                      Vale la pena contactar
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="interactions" className="space-y-4">
          {interactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay interacciones registradas con este champion.
              </CardContent>
            </Card>
          ) : (
            interactions.map((interaction) => (
              <Card key={interaction.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {CHANNEL_LABELS[interaction.channel]}
                      </CardTitle>
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
                    <Badge
                      variant="outline"
                      className={
                        interaction.outcome === "responded"
                          ? "border-chart-2/50 text-chart-2"
                          : interaction.outcome === "ignored"
                          ? "border-muted text-muted-foreground"
                          : ""
                      }
                    >
                      {interaction.outcome === "sent"
                        ? "Enviado"
                        : interaction.outcome === "responded"
                        ? "Respondido"
                        : "Sin respuesta"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {interaction.insight && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Insight:</p>
                      <p className="text-sm">{interaction.insight}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Mensaje:</p>
                    <p className="text-sm">{interaction.message}</p>
                  </div>
                  {interaction.response && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Respuesta:</p>
                      <p className="text-sm">{interaction.response}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="sequence" className="space-y-4">
          <ChampionSequenceStatus championId={champion.id} championName={champion.name} />
          <SequenceTracker champion={champion} companyData={companyData} />
        </TabsContent>
      </Tabs>

      {/* Dialog Seenka AI */}
      <Dialog open={seenkaAIDialogOpen} onOpenChange={setSeenkaAIDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Datos Seenka</DialogTitle>
            <DialogDescription>
              Datos reales de inversion publicitaria del sector.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {/* Estado de carga */}
            {mcpLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Consultando Seenka...</span>
              </div>
            )}

            {/* Error */}
            {mcpError && !mcpLoading && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm text-destructive mb-3">{mcpError}</p>
                <Button size="sm" variant="outline" onClick={querySeenkaMCP}>
                  Reintentar
                </Button>
              </div>
            )}

            {/* Resultado */}
            {mcpResult && !mcpLoading && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed">{mcpResult}</pre>
              </div>
            )}
            
            {/* Textarea para editar */}
            {mcpResult && !mcpLoading && (
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Editar resultado antes de guardar:</span>
                <Textarea
                  value={seenkaAIResponse}
                  onChange={function(e) { setSeenkaAIResponse(e.target.value) }}
                  rows={6}
                  className="text-xs"
                />
              </div>
            )}
            
            {/* Insight guardado anteriormente */}
            {champion.seenka_ai_insight && !seenkaAIResponse && !mcpLoading && (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4">
                <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-2">Insight guardado anteriormente:</p>
                <p className="text-sm text-green-700 dark:text-green-300">{champion.seenka_ai_insight}</p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={function() { setSeenkaAIDialogOpen(false) }}>
              Cerrar
            </Button>
            <Button onClick={handleSaveSeenkaInsight} disabled={!seenkaAIResponse.trim() || isSavingSeenkaInsight}>
              {isSavingSeenkaInsight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Guardar insight
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Generar Mensaje con IA</DialogTitle>
            <DialogDescription>
              Selecciona un trigger y canal para generar un mensaje personalizado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Trigger</Label>
              <Select
                value={selectedTrigger?.id || ""}
                onValueChange={(v) => {
                  const trigger = triggers.find((t) => t.id === v)
                  setSelectedTrigger(trigger || null)
                  setGeneratedInsight(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar trigger" />
                </SelectTrigger>
                <SelectContent>
                  {triggers.map((trigger) => (
                    <SelectItem key={trigger.id} value={trigger.id}>
                      {trigger.is_worth_contacting && "(Recomendado) "}
                      {trigger.topic || trigger.source_text.substring(0, 50)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Canal</Label>
              <Select
                value={channel}
                onValueChange={(v) => {
                  setChannel(v as "linkedin" | "email")
                  setGeneratedInsight(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerateInsight}
              disabled={!selectedTrigger || isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar con IA
                </>
              )}
            </Button>

            {generatedInsight && (
              <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                <div>
                  <p className="text-sm font-medium">Insight:</p>
                  <p className="text-sm text-muted-foreground">{generatedInsight.insight}</p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">Mensaje sugerido:</p>
                    <Button variant="ghost" size="sm" onClick={handleCopyMessage}>
                      {copiedMessage ? (
                        <Check className="mr-1 h-3 w-3" />
                      ) : (
                        <Copy className="mr-1 h-3 w-3" />
                      )}
                      {copiedMessage ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <Textarea
                    value={generatedInsight.suggested_message}
                    readOnly
                    rows={4}
                    className="bg-background"
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Puntos clave:</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {generatedInsight.talking_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {makeError && (
            <p className="text-sm text-destructive">{makeError}</p>
          )}

          {makeSent && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Enviado a Make correctamente
            </p>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGenerateDialogOpen(false)
                setGeneratedInsight(null)
                setSelectedTrigger(null)
                setMakeError(null)
              }}
            >
              Cancelar
            </Button>
            {generatedInsight && (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleSaveInteraction} 
                  disabled={isSaving || isSendingToMake}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Solo Guardar
                </Button>
                <Button 
                  onClick={handleSendToMake} 
                  disabled={isSaving || isSendingToMake || makeSent}
                >
                  {isSendingToMake ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : makeSent ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {makeSent ? "Enviado" : "Enviar Mensaje"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edición de champion */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Champion</DialogTitle>
            <DialogDescription>Editá los datos de {champion.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="juan@empresa.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Cargo / Rol</Label>
              <Input
                id="edit-role"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-company">Empresa</Label>
              <Input
                id="edit-company"
                value={editForm.company}
                onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-country">País</Label>
              <Input
                id="edit-country"
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-headline">Headline</Label>
              <Input
                id="edit-headline"
                value={editForm.headline}
                onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
              <Input
                id="edit-linkedin"
                value={editForm.linkedin_url}
                onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo de Champion</Label>
                <Select
                  value={editForm.champion_type}
                  onValueChange={(v) => setEditForm({ ...editForm, champion_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHAMPION_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Nivel</Label>
                <Select
                  value={editForm.champion_level}
                  onValueChange={(v) => setEditForm({ ...editForm, champion_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit || !editForm.name}>
              {isSavingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
