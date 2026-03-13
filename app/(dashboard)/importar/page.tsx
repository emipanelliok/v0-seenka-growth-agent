"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  UserPlus,
  ExternalLink,
  Download,
  Sparkles,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

// All fields that can come from CSV
interface ProspectRow {
  linkedin_url?: string
  name?: string
  email?: string
  role?: string
  company?: string
  country?: string
  headline?: string
  champion_type?: string
  champion_level?: string
  client_1?: string
  client_2?: string
}

interface ProspectResult extends ProspectRow {
  score: "high" | "medium" | "low" | "error"
  score_reason: string
  recommended_products?: string[]
  status: "pending" | "processing" | "done" | "error"
  error_message?: string
  enriched_data?: Record<string, unknown>
  _rowKey: string // unique key for deduplication (linkedin_url or name+company)
}

// Column aliases for flexible CSV parsing
const COLUMN_MAP: Record<string, keyof ProspectRow> = {
  // linkedin_url
  linkedin_url: "linkedin_url",
  linkedin: "linkedin_url",
  url: "linkedin_url",
  perfil: "linkedin_url",
  "url linkedin": "linkedin_url",
  // name
  nombre: "name",
  name: "name",
  // email
  email: "email",
  correo: "email",
  "e-mail": "email",
  // role
  rol: "role",
  role: "role",
  cargo: "role",
  puesto: "role",
  titulo: "role",
  // company
  empresa: "company",
  company: "company",
  "compañia": "company",
  organizacion: "company",
  // country
  pais: "country",
  country: "country",
  "país": "country",
  // headline
  headline: "headline",
  descripcion: "headline",
  bio: "headline",
  // champion_type
  tipo: "champion_type",
  champion_type: "champion_type",
  "tipo champion": "champion_type",
  // champion_level
  nivel: "champion_level",
  champion_level: "champion_level",
  "nivel champion": "champion_level",
  // clients
  cliente_1: "client_1",
  client_1: "client_1",
  "cliente 1": "client_1",
  "client 1": "client_1",
  marca_1: "client_1",
  cliente_2: "client_2",
  client_2: "client_2",
  "cliente 2": "client_2",
  "client 2": "client_2",
  marca_2: "client_2",
}

function downloadTemplateCsv() {
  const headers = [
    "linkedin_url",
    "name",
    "email",
    "role",
    "company",
    "country",
    "headline",
    "champion_type",
    "champion_level",
    "client_1",
    "client_2",
  ]
  const example = [
    "https://linkedin.com/in/juanperez",
    "Juan Pérez",
    "juan@empresa.com",
    "CMO",
    "Empresa SA",
    "Argentina",
    "Marketing & Growth Leader",
    "marketing",
    "medium",
    "Coca-Cola",
    "Pepsi",
  ]
  const csv = [headers.join(","), example.join(",")].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "plantilla-champions.csv"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [prospects, setProspects] = useState<ProspectResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [enrichProgress, setEnrichProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set())
  const [importedChampionIds, setImportedChampionIds] = useState<string[]>([])
  const [importComplete, setImportComplete] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const dropped = acceptedFiles[0]
    if (dropped) {
      setFile(dropped)
      parseFile(dropped)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  })

  async function parseFile(f: File) {
    const text = await f.text()
    const lines = text.split("\n").filter((line) => line.trim())
    if (lines.length < 2) {
      alert("El archivo no tiene datos. Revisá que tenga al menos una fila de encabezados y una de datos.")
      return
    }

    // Parse headers and map to known fields
    const rawHeaders = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""))
    const fieldMap: (keyof ProspectRow | null)[] = rawHeaders.map(
      (h) => COLUMN_MAP[h] ?? null
    )

    const parsed: ProspectResult[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""))
      const row: ProspectRow = {}
      fieldMap.forEach((field, idx) => {
        if (field && values[idx]) row[field] = values[idx]
      })

      // Need at least linkedin_url OR name to be a valid row
      if (!row.linkedin_url && !row.name) continue

      // Skip if linkedin_url doesn't look like a URL when provided
      if (row.linkedin_url && !row.linkedin_url.startsWith("http")) continue

      const rowKey = row.linkedin_url || `${row.name}-${row.company}`
      parsed.push({
        ...row,
        score: "medium",
        score_reason: "Pendiente de análisis",
        status: "pending",
        _rowKey: rowKey,
      })
    }

    if (parsed.length === 0) {
      alert("No se encontraron filas válidas. Revisá que el archivo tenga el formato correcto.")
      return
    }

    setProspects(parsed)
  }

  async function importAndEnrich() {
    if (prospects.length === 0) return
    
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setIsProcessing(true)
    setProgress(0)
    setCurrentStep("Importando champions...")

    const total = prospects.length
    const championIds: string[] = []

    // Step 1: Import all champions
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i]
      setCurrentStep(`Importando ${prospect.name || "champion"} (${i + 1}/${total})`)
      setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "processing" } : p)))

      try {
        const { data: newChampion, error } = await supabase.from("champions").insert({
          user_id: user.id,
          name: prospect.name || "Sin nombre",
          email: prospect.email || null,
          company: prospect.company || null,
          role: prospect.role || null,
          country: prospect.country || null,
          headline: prospect.headline || null,
          linkedin_url: prospect.linkedin_url || null,
          champion_type: prospect.champion_type || "marketing",
          champion_level: prospect.champion_level || "medium",
          status: "listening",
          enrichment_status: prospect.linkedin_url ? "pending" : "complete",
        }).select("id").single()

        if (error || !newChampion) {
          setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error", score: "error", score_reason: "Error al importar" } : p)))
          continue
        }

        championIds.push(newChampion.id)

        // Match clients against nomenclador
        const clientNames = [prospect.client_1, prospect.client_2].filter(Boolean) as string[]
        if (clientNames.length > 0) {
          const clientsToInsert = await Promise.all(
            clientNames.map(async (name) => {
              const res = await fetch("/api/nomenclador/match", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_name: name.trim() }),
              })
              const match = res.ok ? await res.json() : null
              return {
                champion_id: newChampion.id,
                client_name: name.trim(),
                nomenclador_id: match?.found ? match.id : null,
                matched_entidad: match?.found ? match.entidad : null,
                matched_sector: match?.found ? match.sector : null,
                matched_industria: match?.found ? match.industria : null,
                match_score: match?.found ? match.score : null,
              }
            })
          )
          await supabase.from("champion_clients").insert(clientsToInsert)
        }

        setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "done", score: "medium", score_reason: "Importado" } : p)))
        setSelectedProspects((prev) => new Set([...prev, prospect._rowKey]))
      } catch (error) {
        setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error", score: "error", score_reason: "Error" } : p)))
      }

      setProgress(Math.round(((i + 1) / total) * 100))
    }

    setImportedChampionIds(championIds)
    setIsProcessing(false)
    setImportComplete(true)

    // Step 2: Auto-enrich all champions with LinkedIn URLs in background
    const championsWithLinkedIn = prospects.filter(p => p.linkedin_url && p.status !== "error")
    if (championsWithLinkedIn.length > 0) {
      setIsEnriching(true)
      setEnrichProgress(0)
      setCurrentStep("Enriqueciendo perfiles con LinkedIn...")

      let enriched = 0
      for (let i = 0; i < championIds.length; i++) {
        const prospect = prospects[i]
        if (!prospect.linkedin_url || prospect.status === "error") continue

        setCurrentStep(`Enriqueciendo ${prospect.name || "perfil"} (${enriched + 1}/${championsWithLinkedIn.length})`)

        try {
          await fetch("/api/champions/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ champion_id: championIds[i] }),
          })
          
          // Also analyze the prospect with AI
          await fetch("/api/ai/analyze-prospect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              champion_id: championIds[i],
              linkedin_url: prospect.linkedin_url,
              name: prospect.name,
              role: prospect.role,
              company: prospect.company,
            }),
          })

          setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, score: "high", score_reason: "Enriquecido con LinkedIn" } : p)))
        } catch (e) {
          // Continue even if one fails
        }

        enriched++
        setEnrichProgress(Math.round((enriched / championsWithLinkedIn.length) * 100))
        
        // Small delay to not overwhelm APIs
        if (enriched < championsWithLinkedIn.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      setIsEnriching(false)
      setCurrentStep("")
    }
  }

  const scoreColors = {
    high: "bg-green-500/10 text-green-600 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    low: "bg-red-500/10 text-red-600 border-red-500/20",
    error: "bg-muted text-muted-foreground",
  }
  const scoreLabels = { high: "Alto", medium: "Medio", low: "Bajo", error: "Error" }

  const processedCount = prospects.filter((p) => p.status === "done").length
  const highScoreCount = prospects.filter((p) => p.score === "high" && p.status === "done").length
  const hasLinkedin = prospects.some((p) => !!p.linkedin_url)

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Importar Champions</h1>
        <p className="text-muted-foreground mt-1">
          Subí un CSV con los datos de tus champions. LinkedIn es opcional, podés cargar solo datos manuales.
        </p>
      </div>

      {/* Upload */}
      {prospects.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subir archivo</CardTitle>
            <CardDescription>
              El CSV puede tener cualquier combinación de campos. Descargá la plantilla para ver el formato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg">Soltá el archivo acá...</p>
              ) : (
                <>
                  <p className="text-lg mb-2">Arrastrá un archivo o hacé click para seleccionar</p>
                  <p className="text-sm text-muted-foreground">CSV, XLS o XLSX</p>
                </>
              )}
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg space-y-3">
              <p className="font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Columnas disponibles:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                {[
                  ["linkedin_url", "URL de LinkedIn (opcional)"],
                  ["name", "Nombre *"],
                  ["email", "Email"],
                  ["role", "Rol / Cargo"],
                  ["company", "Empresa"],
                  ["country", "País"],
                  ["headline", "Headline"],
                  ["champion_type", "Tipo (marketing/media/creative/strategy/brand)"],
                  ["champion_level", "Nivel (low/medium/high/vip)"],
                  ["client_1", "Cliente/Marca 1"],
                  ["client_2", "Cliente/Marca 2"],
                ].map(([col, desc]) => (
                  <div key={col}>
                    <code className="text-xs bg-background px-1 rounded">{col}</code>
                    <span className="text-muted-foreground ml-1 text-xs">{desc}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplateCsv}>
                <Download className="h-4 w-4 mr-2" />
                Descargar plantilla CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview before processing */}
      {prospects.length > 0 && !isProcessing && !isEnriching && !importComplete && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {file?.name}
            </CardTitle>
            <CardDescription>
              Se encontraron {prospects.length} champions para importar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{prospects.length}</p>
                <p className="text-sm text-muted-foreground">Champions a importar</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{prospects.filter(p => p.linkedin_url).length}</p>
                <p className="text-sm text-muted-foreground">Con LinkedIn (se enriqueceran)</p>
              </div>
            </div>
            
            {hasLinkedin && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Enriquecimiento automatico</p>
                  <p className="text-sm text-muted-foreground">
                    Los perfiles con LinkedIn se enriqueceran automaticamente con foto, cargo, empresa y mas datos.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={importAndEnrich} size="lg">
                <UserPlus className="h-4 w-4 mr-2" />
                Importar y enriquecer
              </Button>
              <Button variant="outline" onClick={() => { setFile(null); setProspects([]) }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing / Enriching */}
      {(isProcessing || isEnriching) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8">
            <div className="space-y-6">
              {/* Import progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    )}
                    <span className="font-medium">Importando champions</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Enrich progress */}
              {(isEnriching || importComplete) && hasLinkedin && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isEnriching ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : enrichProgress === 100 ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="font-medium">Enriqueciendo perfiles</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{enrichProgress}%</span>
                  </div>
                  <Progress value={enrichProgress} className="h-2 [&>div]:bg-emerald-500" />
                </div>
              )}

              <p className="text-sm text-muted-foreground text-center">{currentStep}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {importComplete && !isEnriching && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Importacion completa
              </h2>
              <p className="text-muted-foreground">
                {processedCount} champions importados
                {highScoreCount > 0 && ` · ${highScoreCount} enriquecidos con LinkedIn`}
              </p>
            </div>
            <Button asChild>
              <Link href="/champions">
                Ver Champions
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Empresa / País</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Potencial</TableHead>
                  <TableHead>Razón</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((prospect, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{prospect.name || "Sin nombre"}</p>
                        <p className="text-sm text-muted-foreground">{prospect.role}</p>
                        {prospect.email && (
                          <p className="text-xs text-muted-foreground">{prospect.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{prospect.company || "-"}</p>
                        {prospect.country && (
                          <p className="text-sm text-muted-foreground">{prospect.country}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {prospect.client_1 && (
                          <Badge variant="outline" className="text-xs">{prospect.client_1}</Badge>
                        )}
                        {prospect.client_2 && (
                          <Badge variant="outline" className="text-xs">{prospect.client_2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {prospect.status === "processing" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : prospect.status === "done" ? (
                        <Badge className={scoreColors[prospect.score]}>
                          {scoreLabels[prospect.score]}
                        </Badge>
                      ) : prospect.status === "error" ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm truncate">{prospect.score_reason}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {prospect.linkedin_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {prospect.status === "done" && (
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        )}
                        {prospect.status === "error" && (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFile(null)
                setProspects([])
                setSelectedProspects(new Set())
                setProgress(0)
                setEnrichProgress(0)
                setImportComplete(false)
                setImportedChampionIds([])
              }}
            >
              Nueva importacion
            </Button>
            <Button asChild>
              <Link href="/efemerides">Ir a Efemerides</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
