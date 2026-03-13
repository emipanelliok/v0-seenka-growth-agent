"use client"

import React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { ChampionLevel, ChampionType, LinkedInExperience, LinkedInEducation, SimilarProfile } from "@/lib/types"
import { LEVEL_LABELS, CHAMPION_TYPE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Sparkles, Loader2, Building, GraduationCap, Users, Globe, X, Search, CheckCircle2 } from "lucide-react"
import Image from "next/image"

interface EnrichedData {
  name: string | null
  role: string | null
  company: string | null
  industry: string | null
  country: string | null
  headline: string | null
  summary: string | null
  photo_url: string | null
  website_url: string | null
  follower_count: number | null
  connection_count: number | null
  languages: string[]
  experiences: LinkedInExperience[]
  educations: LinkedInEducation[]
  similar_profiles: SimilarProfile[]
  linkedin_data?: Record<string, unknown>
}

interface ClientEntry {
  name: string
  searching: boolean
  match: {
    id: number
    entidad: string
    sector: string
    industria: string
    similarity: number
  } | null
}

export function AddChampionButton() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [enrichedData, setEnrichedData] = useState<EnrichedData | null>(null)
  const [clients, setClients] = useState<ClientEntry[]>([
    { name: "", searching: false, match: null },
  ])
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    company: "",
    country: "",
    headline: "",
    champion_level: "medium" as ChampionLevel,
    champion_type: "marketing" as ChampionType,
  })
  const router = useRouter()

  // Buscar cliente en nomenclador de Seenka
  const searchClient = async (index: number, clientName: string) => {
    if (clientName.length < 2) return

    setClients((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], name: clientName, searching: true, match: null }
      return updated
    })

    try {
      console.log("[v0] Buscando cliente:", clientName)
      const response = await fetch("/api/nomenclador/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: clientName }),
      })
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Respuesta nomenclador:", data)
        setClients((prev) => {
          const updated = [...prev]
          updated[index] = {
            ...updated[index],
            name: clientName,
            searching: false,
            match: data.found ? data : null,
          }
          return updated
        })
      } else {
        console.log("[v0] Error response:", response.status)
        setClients((prev) => {
          const updated = [...prev]
          updated[index] = { ...updated[index], searching: false }
          return updated
        })
      }
    } catch (err) {
      console.log("[v0] Error buscando cliente:", err)
      setClients((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], searching: false }
        return updated
      })
    }
  }

  // Debounce para búsqueda
  const clientSearchTimers = React.useRef<NodeJS.Timeout[]>([])
  const handleClientChange = (index: number, value: string) => {
    const updated = [...clients]
    updated[index].name = value
    updated[index].match = null
    setClients(updated)

    if (clientSearchTimers.current[index]) {
      clearTimeout(clientSearchTimers.current[index])
    }
    if (value.length >= 2) {
      clientSearchTimers.current[index] = setTimeout(() => {
        searchClient(index, value)
      }, 500)
    }
  }

  const addClientField = () => {
    if (clients.length < 2) {
      setClients([...clients, { name: "", searching: false, match: null }])
    }
  }

  const removeClientField = (index: number) => {
    setClients(clients.filter((_, i) => i !== index))
  }

  const handleEnrich = async () => {
    if (!linkedinUrl) {
      setError("Ingresá una URL de LinkedIn primero")
      return
    }

    setIsEnriching(true)
    setError(null)

    try {
      const response = await fetch("/api/linkedin/enrich-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error al enriquecer perfil")
      }

      const enriched: EnrichedData = await response.json()
      setEnrichedData(enriched)

      // Solo usar Piloterr para preview rápido. PDL + Company + GPT se hace en background al guardar.
      const detectedType = (enriched as any).champion_type || "marketing"

      setFormData({
        name: enriched.name || formData.name,
        role: enriched.role || formData.role,
        company: enriched.company || formData.company,
        country: enriched.country || formData.country,
        headline: enriched.headline || formData.headline,
        champion_level: formData.champion_level,
        champion_type: detectedType,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enriquecer perfil")
    } finally {
      setIsEnriching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!formData.name) {
      setError("El nombre es requerido")
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError("No se pudo obtener el usuario")
      setIsLoading(false)
      return
    }

    // Crear champion inmediatamente con datos mínimos
    const { data: newChampion, error: insertError } = await supabase.from("champions").insert({
      name: formData.name,
      email: formData.email || null,
      linkedin_url: linkedinUrl || null,
      role: formData.role || null,
      company: formData.company || null,
      country: formData.country || null,
      headline: formData.headline || null,
      photo_url: enrichedData?.photo_url || null,
      champion_level: formData.champion_level,
      champion_type: formData.champion_type,
      user_id: user.id,
      enrichment_status: linkedinUrl ? "enriching" : "complete",
    }).select("id").single()

    if (insertError) {
      setError(insertError.message)
      setIsLoading(false)
      return
    }

    // Insertar clientes si hay alguno con nombre
    const validClients = clients.filter(c => c.name.trim().length > 0)
    if (validClients.length > 0 && newChampion?.id) {
      const clientInserts = validClients.map(c => ({
        champion_id: newChampion.id,
        client_name: c.name.trim(),
        nomenclador_id: c.match?.id || null,
        matched_entidad: c.match?.entidad || null,
        matched_sector: c.match?.sector || null,
        matched_industria: c.match?.industria || null,
          match_score: c.match?.score || null,
      }))
      await supabase.from("champion_clients").insert(clientInserts)
    }

    // Cerrar diálogo inmediatamente
    setIsLoading(false)
    setOpen(false)
    resetForm()
    router.refresh()

    // Disparar enriquecimiento en background si hay URL de LinkedIn
    if (linkedinUrl && newChampion?.id) {
      fetch("/api/champions/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champion_id: newChampion.id }),
      }).then(() => {
        // Refresh para actualizar el estado
        router.refresh()
      }).catch((err) => {
        console.error("Background enrichment failed:", err)
      })
    }
  }

  const resetForm = () => {
    setLinkedinUrl("")
    setEnrichedData(null)
    setClients([{ name: "", searching: false, match: null }])
    setFormData({
      name: "",
      email: "",
      role: "",
      company: "",
      country: "",
      headline: "",
      champion_level: "medium",
      champion_type: "marketing",
    })
    setError(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      resetForm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Champion
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Agregar Champion</DialogTitle>
          <DialogDescription>
            Pegá la URL de LinkedIn y enriquecé automáticamente los datos.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4 pr-4">
              {/* LinkedIn URL with Enrich button */}
              <div className="grid gap-2">
                <Label htmlFor="linkedin_url">URL de LinkedIn</Label>
                <div className="flex gap-2">
                  <Input
                    id="linkedin_url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/nombre"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleEnrich}
                    disabled={isEnriching || !linkedinUrl}
                  >
                    {isEnriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span className="ml-2">
                      {isEnriching ? "Buscando..." : "Enriquecer"}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Enriched Profile Preview */}
              {enrichedData && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                  {/* Header with photo and basic info */}
                  <div className="flex items-start gap-4">
                    {enrichedData.photo_url && (
                      <Image
                        src={enrichedData.photo_url || "/placeholder.svg"}
                        alt={enrichedData.name || "Foto de perfil"}
                        width={64}
                        height={64}
                        className="rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 space-y-1">
                      <h4 className="font-semibold text-lg">{enrichedData.name}</h4>
                      {enrichedData.headline && (
                        <p className="text-sm text-muted-foreground">{enrichedData.headline}</p>
                      )}
                      {enrichedData.website_url && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            Web
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Languages */}
                  {enrichedData.languages && enrichedData.languages.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {enrichedData.languages.map((lang, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Experience Preview */}
                  {enrichedData.experiences && enrichedData.experiences.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Building className="h-4 w-4" />
                        Experiencia
                      </div>
                      <div className="space-y-2 pl-6">
                        {enrichedData.experiences.slice(0, 3).map((exp, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">{exp.title}</span>
                            <span className="text-muted-foreground"> en {exp.company}</span>
                            {exp.is_current && (
                              <Badge variant="default" className="ml-2 text-xs">Actual</Badge>
                            )}
                          </div>
                        ))}
                        {enrichedData.experiences.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{enrichedData.experiences.length - 3} experiencias más
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Education Preview */}
                  {enrichedData.educations && enrichedData.educations.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <GraduationCap className="h-4 w-4" />
                        Educación
                      </div>
                      <div className="space-y-2 pl-6">
                        {enrichedData.educations.slice(0, 2).map((edu, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">{edu.school}</span>
                            {edu.degree && (
                              <span className="text-muted-foreground"> - {edu.degree}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Similar Profiles */}
                  {enrichedData.similar_profiles && enrichedData.similar_profiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="h-4 w-4" />
                        Perfiles similares (posibles champions)
                      </div>
                      <div className="flex flex-wrap gap-2 pl-6">
                        {enrichedData.similar_profiles.slice(0, 5).map((profile, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs cursor-pointer hover:bg-accent">
                            {profile.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              <Separator />

              {/* Editable Fields */}
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Juan Pérez"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan@empresa.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  value={formData.headline}
                  onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                  placeholder="CMO | Marketing Expert"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="role">Rol</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="CMO"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="company">Empresa</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Empresa SA"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Argentina"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="champion_type">Tipo de Champion</Label>
                  <Select 
                    value={formData.champion_type} 
                    onValueChange={(value) => setFormData({ ...formData, champion_type: value as ChampionType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
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
              </div>

              {/* Clientes / Marcas */}
              <Separator />
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Clientes / Marcas</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Marcas que atiende. Se buscan automáticamente en el nomenclador de Seenka.
                    </p>
                  </div>
                  {clients.length < 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addClientField}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar
                    </Button>
                  )}
                </div>
                {clients.map((client, index) => (
                  <div key={index} className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={client.name}
                          onChange={(e) => handleClientChange(index, e.target.value)}
                          placeholder="Ej: Coca-Cola, YPF, Banco Galicia..."
                          className="pl-9"
                        />
                        {client.searching && (
                          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {clients.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeClientField(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {/* Match result */}
                    {client.match && (
                      <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200 truncate">
                            {client.match.entidad}
                          </p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {client.match.industria} &middot; {client.match.sector}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                          {Math.round(client.match.similarity * 100)}% match
                        </Badge>
                      </div>
                    )}
                    {client.name.length >= 2 && !client.searching && !client.match && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 pl-1">
                        No se encontró en el nomenclador de Seenka. Se guardará igualmente.
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="champion_level">Nivel de Champion</Label>
                <Select 
                  value={formData.champion_level} 
                  onValueChange={(value) => setFormData({ ...formData, champion_level: value as ChampionLevel })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar nivel" />
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

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter className="pr-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : "Guardar Champion"}
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
