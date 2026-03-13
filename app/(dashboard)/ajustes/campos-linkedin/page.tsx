"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, CheckCircle, ArrowLeft, Eye, EyeOff, Database, Plus, X, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Todos los campos que trae Proxycurl de LinkedIn
const LINKEDIN_FIELDS = [
  { key: "full_name", label: "Nombre completo", description: "Nombre y apellido de la persona", example: "Pablo Verdenelli" },
  { key: "first_name", label: "Nombre", description: "Primer nombre", example: "Pablo" },
  { key: "last_name", label: "Apellido", description: "Apellido", example: "Verdenelli" },
  { key: "headline", label: "Titular", description: "El headline de LinkedIn", example: "CEO at Seenka Media Intelligence" },
  { key: "summary", label: "Resumen", description: "La sección 'Acerca de'", example: "Emprendedor con 10+ años de experiencia..." },
  { key: "occupation", label: "Ocupación", description: "Ocupación actual", example: "CEO" },
  { key: "country", label: "País", description: "País de residencia", example: "Argentina" },
  { key: "country_full_name", label: "País (completo)", description: "Nombre completo del país", example: "Argentina" },
  { key: "city", label: "Ciudad", description: "Ciudad de residencia", example: "Buenos Aires" },
  { key: "state", label: "Estado/Provincia", description: "Estado o provincia", example: "Buenos Aires" },
  { key: "profile_pic_url", label: "Foto de perfil", description: "URL de la foto de perfil", example: "https://media.linkedin.com/..." },
  { key: "background_cover_image_url", label: "Imagen de fondo", description: "Imagen de portada del perfil", example: "https://media.linkedin.com/..." },
  { key: "public_identifier", label: "ID público", description: "El identificador en la URL de LinkedIn", example: "pabloverdenelli" },
  { key: "connections", label: "Conexiones", description: "Número de conexiones", example: "500+" },
  { key: "follower_count", label: "Seguidores", description: "Cantidad de seguidores", example: "1250" },
  
  // Experiencia
  { key: "experiences", label: "Experiencias", description: "Historial laboral completo", example: "[{company: 'Seenka', title: 'CEO', ...}]", isArray: true },
  { key: "experiences.company", label: "Empresa actual", description: "Nombre de la empresa actual", example: "Seenka Media Intelligence" },
  { key: "experiences.title", label: "Cargo actual", description: "Título del puesto actual", example: "CEO & Co-founder" },
  { key: "experiences.description", label: "Descripción del puesto", description: "Descripción del rol actual", example: "Lidero el equipo de..." },
  { key: "experiences.starts_at", label: "Fecha inicio trabajo", description: "Cuándo empezó en el puesto", example: "2015-01" },
  { key: "experiences.ends_at", label: "Fecha fin trabajo", description: "Cuándo terminó (null si actual)", example: "null" },
  { key: "experiences.location", label: "Ubicación trabajo", description: "Dónde trabaja", example: "Buenos Aires, Argentina" },
  
  // Educación
  { key: "education", label: "Educación", description: "Historial educativo completo", example: "[{school: 'UBA', degree: 'MBA', ...}]", isArray: true },
  { key: "education.school", label: "Universidad/Instituto", description: "Nombre de la institución", example: "Universidad de Buenos Aires" },
  { key: "education.degree_name", label: "Título", description: "Nombre del título obtenido", example: "MBA" },
  { key: "education.field_of_study", label: "Campo de estudio", description: "Área de especialización", example: "Marketing" },
  
  // Skills, idiomas, etc
  { key: "skills", label: "Habilidades", description: "Lista de skills", example: "['Marketing', 'Strategy', 'Leadership']", isArray: true },
  { key: "languages", label: "Idiomas", description: "Idiomas que habla", example: "['Spanish', 'English']", isArray: true },
  { key: "certifications", label: "Certificaciones", description: "Certificaciones obtenidas", example: "[{name: 'Google Analytics', ...}]", isArray: true },
  { key: "volunteer_work", label: "Voluntariado", description: "Trabajo voluntario", example: "[{organization: 'ONG', ...}]", isArray: true },
  { key: "publications", label: "Publicaciones", description: "Artículos publicados", example: "[{name: 'Article', ...}]", isArray: true },
  { key: "honors_awards", label: "Premios", description: "Premios y reconocimientos", example: "[{title: 'Award', ...}]", isArray: true },
  { key: "recommendations", label: "Recomendaciones", description: "Recomendaciones recibidas", example: "[{text: '...', ...}]", isArray: true },
  
  // Datos de empresa
  { key: "company_linkedin_url", label: "LinkedIn de empresa", description: "URL del perfil de la empresa", example: "https://linkedin.com/company/seenka" },
  { key: "company_website", label: "Web de empresa", description: "Sitio web de la empresa", example: "https://seenka.com" },
  { key: "company_industry", label: "Industria de empresa", description: "Industria en la que opera", example: "Media Intelligence" },
  { key: "company_size", label: "Tamaño de empresa", description: "Rango de empleados", example: "11-50 employees" },
  
  // Otros
  { key: "personal_emails", label: "Emails personales", description: "Emails encontrados", example: "['pablo@email.com']", isArray: true },
  { key: "personal_numbers", label: "Teléfonos", description: "Números de teléfono", example: "['+54 11 1234-5678']", isArray: true },
  { key: "birth_date", label: "Fecha de nacimiento", description: "Cumpleaños (si está público)", example: "1985-03-15" },
  { key: "gender", label: "Género", description: "Género (si está público)", example: "male" },
]

// Campos base que guardamos en nuestra DB de champions
const BASE_DB_FIELDS = [
  { key: "name", label: "Nombre (DB)", isCore: true },
  { key: "role", label: "Rol (DB)", isCore: true },
  { key: "company", label: "Empresa (DB)", isCore: true },
  { key: "industry", label: "Industria (DB)", isCore: true },
  { key: "country", label: "País (DB)", isCore: true },
  { key: "linkedin_url", label: "LinkedIn URL (DB)", isCore: true },
  { key: "photo_url", label: "Foto URL (DB)", isCore: true },
  { key: "headline", label: "Headline (DB)", isCore: true },
  { key: "summary", label: "Summary (DB)", isCore: true },
  { key: "linkedin_data", label: "LinkedIn Data (JSON completo)", isCore: true },
]

const DB_FIELDS = [
  { key: "name", label: "Nombre (DB)" },
  { key: "role", label: "Rol (DB)" },
  { key: "company", label: "Empresa (DB)" },
  { key: "industry", label: "Industria (DB)" },
  { key: "country", label: "País (DB)" },
  { key: "linkedin_url", label: "LinkedIn URL (DB)" },
  { key: "photo_url", label: "Foto URL (DB)" },
  { key: "headline", label: "Headline (DB)" },
  { key: "summary", label: "Summary (DB)" },
  { key: "linkedin_data", label: "LinkedIn Data (JSON completo)" },
]

interface FieldConfig {
  linkedinField: string
  dbField: string
  visible: boolean
  customLabel?: string
}

interface CustomDbField {
  key: string
  label: string
  isCore: false
}

export default function CamposLinkedInPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sampleChampion, setSampleChampion] = useState<Record<string, unknown> | null>(null)
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([])
  const [customDbFields, setCustomDbFields] = useState<CustomDbField[]>([])
  const [showAddFieldDialog, setShowAddFieldDialog] = useState(false)
  const [newFieldName, setNewFieldName] = useState("")
  const [newFieldLabel, setNewFieldLabel] = useState("")
  const [addFieldError, setAddFieldError] = useState<string | null>(null)
  
  const supabase = createClient()
  
  // Combinar campos base con custom
  const DB_FIELDS = [...BASE_DB_FIELDS, ...customDbFields]

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Cargar un champion de ejemplo - preferimos Pablo Verdenelli que tiene datos completos
      let { data: champion } = await supabase
        .from("champions")
        .select("*")
        .eq("user_id", user.id)
        .ilike("name", "%Pablo Verdenelli%")
        .limit(1)
        .single()

      // Si no está Pablo, buscar uno con linkedin_data
      if (!champion) {
        const { data: withData } = await supabase
          .from("champions")
          .select("*")
          .eq("user_id", user.id)
          .not("linkedin_data", "is", null)
          .limit(1)
          .single()
        champion = withData
      }

      // Si no hay con linkedin_data, buscar el que tenga más datos (experiences no null)
      if (!champion) {
        const { data: anyChampion } = await supabase
          .from("champions")
          .select("*")
          .eq("user_id", user.id)
          .not("experiences", "is", null)
          .limit(1)
          .single()
        champion = anyChampion
      }
      
      // Último fallback: cualquiera con linkedin_url
      if (!champion) {
        const { data: anyChampion } = await supabase
          .from("champions")
          .select("*")
          .eq("user_id", user.id)
          .not("linkedin_url", "is", null)
          .limit(1)
          .single()
        champion = anyChampion
      }

      if (champion) {
        setSampleChampion(champion)
      }

      // Cargar configuración de campos guardada
      const { data: settings } = await supabase
        .from("settings")
        .select("key, value")
        .eq("user_id", user.id)
        .in("key", ["linkedin_field_config", "custom_db_fields"])

      if (settings) {
        for (const setting of settings) {
          if (setting.key === "linkedin_field_config" && setting.value) {
            setFieldConfigs(JSON.parse(setting.value))
          }
          if (setting.key === "custom_db_fields" && setting.value) {
            setCustomDbFields(JSON.parse(setting.value))
          }
        }
      }
      
      // Si no hay config, usar defaults
      if (!settings?.find(s => s.key === "linkedin_field_config")) {
        setFieldConfigs(LINKEDIN_FIELDS.map(f => ({
          linkedinField: f.key,
          dbField: getDefaultDbMapping(f.key),
          visible: isDefaultVisible(f.key),
        })))
      }
    } catch {
      // No hay data aún
    } finally {
      setIsLoading(false)
    }
  }

  function getDefaultDbMapping(linkedinField: string): string {
    const mappings: Record<string, string> = {
      "full_name": "name",
      "headline": "headline",
      "summary": "summary",
      "occupation": "role",
      "experiences.company": "company",
      "experiences.title": "role",
      "company_industry": "industry",
      "country": "country",
      "profile_pic_url": "avatar_url",
    }
    return mappings[linkedinField] || ""
  }

  function isDefaultVisible(field: string): boolean {
    const visibleByDefault = [
      "full_name", "headline", "summary", "occupation", "country", "city",
      "profile_pic_url", "experiences", "experiences.company", "experiences.title",
      "education", "skills", "connections", "follower_count"
    ]
    return visibleByDefault.includes(field)
  }

  function toggleVisible(linkedinField: string) {
    setFieldConfigs(prev => prev.map(f => 
      f.linkedinField === linkedinField ? { ...f, visible: !f.visible } : f
    ))
  }

  function updateDbMapping(linkedinField: string, dbField: string) {
    setFieldConfigs(prev => prev.map(f => 
      f.linkedinField === linkedinField ? { ...f, dbField } : f
    ))
  }

  async function handleSave() {
    setIsSaving(true)
    setSaved(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No autenticado")

      // Guardar configuración de campos
      await supabase
        .from("settings")
        .upsert({
          user_id: user.id,
          key: "linkedin_field_config",
          value: JSON.stringify(fieldConfigs),
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id,key"
        })

      // Guardar campos custom
      await supabase
        .from("settings")
        .upsert({
          user_id: user.id,
          key: "custom_db_fields",
          value: JSON.stringify(customDbFields),
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id,key"
        })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error("Error saving:", error)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddCustomField() {
    if (!newFieldName.trim()) {
      setAddFieldError("El nombre del campo es requerido")
      return
    }

    // Validar formato del nombre (snake_case)
    const fieldKey = newFieldName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    
    if (fieldKey.length < 2) {
      setAddFieldError("El nombre debe tener al menos 2 caracteres")
      return
    }

    // Verificar que no exista
    const allFields = [...BASE_DB_FIELDS, ...customDbFields]
    if (allFields.some(f => f.key === fieldKey)) {
      setAddFieldError("Ya existe un campo con ese nombre")
      return
    }

    // Agregar el campo custom
    const newField: CustomDbField = {
      key: fieldKey,
      label: newFieldLabel || newFieldName,
      isCore: false
    }

    setCustomDbFields([...customDbFields, newField])
    setNewFieldName("")
    setNewFieldLabel("")
    setAddFieldError(null)
    setShowAddFieldDialog(false)
  }

  function removeCustomField(key: string) {
    setCustomDbFields(customDbFields.filter(f => f.key !== key))
    // También limpiar cualquier mapeo que use este campo
    setFieldConfigs(fieldConfigs.map(f => 
      f.dbField === key ? { ...f, dbField: "" } : f
    ))
  }

  function getValueFromSample(field: string): string {
    if (!sampleChampion) return "-"
    
    // Primero intentar desde linkedin_data si existe
    const linkedinData = sampleChampion.linkedin_data as Record<string, unknown> | null
    
    // Mapeo de campos de LinkedIn a campos del champion
    const championFieldMapping: Record<string, string> = {
      "full_name": "name",
      "headline": "headline",
      "summary": "summary",
      "occupation": "role",
      "country": "country",
      "profile_pic_url": "photo_url",
      "follower_count": "follower_count",
      "connections": "connection_count",
    }
    
    // Si tenemos linkedin_data, usar eso
    if (linkedinData) {
      if (field.includes(".")) {
        const [parent, child] = field.split(".")
        const arr = linkedinData[parent] as Array<Record<string, unknown>> | undefined
        if (Array.isArray(arr) && arr.length > 0) {
          const value = arr[0][child]
          return value ? String(value).substring(0, 50) + (String(value).length > 50 ? "..." : "") : "-"
        }
        return "-"
      }
      
      const value = linkedinData[field]
      if (Array.isArray(value)) {
        return `[${value.length} items]`
      }
      if (value && typeof value === "object") {
        return "[Object]"
      }
      if (value) {
        return String(value).substring(0, 50) + (String(value).length > 50 ? "..." : "")
      }
    }
    
    // Fallback: usar campos del champion directamente
    const mappedField = championFieldMapping[field]
    if (mappedField && sampleChampion[mappedField]) {
      const value = sampleChampion[mappedField]
      if (Array.isArray(value)) {
        return `[${value.length} items]`
      }
      return String(value).substring(0, 50) + (String(value).length > 50 ? "..." : "")
    }
    
    // Para experiences y education, usar los campos del champion
    if (field === "experiences" && sampleChampion.experiences) {
      const exp = sampleChampion.experiences as unknown[]
      return `[${exp.length} experiencias]`
    }
    if (field.startsWith("experiences.") && sampleChampion.experiences) {
      const exp = sampleChampion.experiences as Array<Record<string, unknown>>
      if (exp.length > 0) {
        const subField = field.split(".")[1]
        const value = exp[0][subField]
        if (value) return String(value).substring(0, 50) + (String(value).length > 50 ? "..." : "")
      }
    }
    if (field === "education" && sampleChampion.educations) {
      const edu = sampleChampion.educations as unknown[]
      return `[${edu.length} estudios]`
    }
    if (field === "languages" && sampleChampion.languages) {
      const langs = sampleChampion.languages as unknown[]
      return `[${langs.length} idiomas]`
    }
    
    return "-"
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/ajustes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Campos de LinkedIn</h1>
          <p className="text-muted-foreground">
            Configurá qué campos de LinkedIn se muestran y cómo se mapean
          </p>
        </div>
      </div>

      {sampleChampion && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Ejemplo: {sampleChampion.name as string}
            </CardTitle>
            <CardDescription>
              Usando datos de este champion como ejemplo
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!sampleChampion && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            No hay champions con datos de LinkedIn importados. 
            Importá un champion para ver los valores de ejemplo.
          </CardContent>
        </Card>
      )}

      {/* Campos Custom */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Campos personalizados</CardTitle>
              <CardDescription>
                Creá campos adicionales para guardar datos de LinkedIn que te interesen
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddFieldDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar campo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {customDbFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay campos personalizados. Los datos extra de LinkedIn se guardan en el campo JSON &quot;linkedin_data&quot;.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customDbFields.map(field => (
                <Badge key={field.key} variant="secondary" className="flex items-center gap-1 px-3 py-1">
                  <span className="font-medium">{field.label}</span>
                  <code className="text-xs ml-1 opacity-70">({field.key})</code>
                  <button 
                    onClick={() => removeCustomField(field.key)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Los campos personalizados se guardan dentro del campo JSON &quot;linkedin_data&quot;. 
              Esto te permite acceder a cualquier dato de LinkedIn sin modificar la estructura de la base de datos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapeo de campos</CardTitle>
          <CardDescription>
            Elegí qué campos mostrar en el perfil del champion y cómo mapearlos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Visible</TableHead>
                  <TableHead>Campo LinkedIn</TableHead>
                  <TableHead>Valor de ejemplo</TableHead>
                  <TableHead className="w-[180px]">Mapea a (DB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LINKEDIN_FIELDS.map(field => {
                  const config = fieldConfigs.find(c => c.linkedinField === field.key)
                  return (
                    <TableRow key={field.key} className={!config?.visible ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch
                          checked={config?.visible ?? false}
                          onCheckedChange={() => toggleVisible(field.key)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{field.label}</span>
                            {field.isArray && (
                              <Badge variant="outline" className="text-xs">Array</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">{field.key}</code>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {sampleChampion ? (
                          <span className={getValueFromSample(field.key) === "-" ? "text-muted-foreground" : ""}>
                            {getValueFromSample(field.key)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">{field.example}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <select
                          value={config?.dbField || ""}
                          onChange={(e) => updateDbMapping(field.key, e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">No mapear</option>
                          {DB_FIELDS.map(db => (
                            <option key={db.key} value={db.key}>{db.label}</option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {saved && (
            <p className="text-sm text-green-600 flex items-center gap-1 mt-4">
              <CheckCircle className="h-4 w-4" />
              Configuración guardada
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar configuración
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leyenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-green-600" />
            <span><strong>Visible:</strong> El campo se muestra en el perfil del champion</span>
          </div>
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <span><strong>Oculto:</strong> El campo se guarda pero no se muestra</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Array</Badge>
            <span>El campo contiene múltiples valores (experiencias, skills, etc.)</span>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo para agregar campo custom */}
      <Dialog open={showAddFieldDialog} onOpenChange={setShowAddFieldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar campo personalizado</DialogTitle>
            <DialogDescription>
              Creá un nuevo campo para guardar datos específicos de LinkedIn
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Nombre del campo</Label>
              <Input
                id="field-name"
                placeholder="ej: skills_count, years_experience"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se convertirá a snake_case automáticamente
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-label">Etiqueta (opcional)</Label>
              <Input
                id="field-label"
                placeholder="ej: Cantidad de skills"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nombre amigable que se muestra en la UI
              </p>
            </div>
            {addFieldError && (
              <p className="text-sm text-destructive">{addFieldError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddFieldDialog(false)
              setNewFieldName("")
              setNewFieldLabel("")
              setAddFieldError(null)
            }}>
              Cancelar
            </Button>
            <Button onClick={handleAddCustomField}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
