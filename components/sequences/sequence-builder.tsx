"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  GitBranch,
  Plus,
  Clock,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Trash2,
  Save,
  Loader2,
  ArrowDown,
  XCircle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react"

interface SequenceStep {
  id?: string
  sequence_id?: string
  step_number: number
  path: "no_response" | "positive" | "lukewarm" | "negative"
  wait_days: number
  message_template: string
  message_tone: string
  is_active: boolean
}

interface Sequence {
  id?: string
  name: string
  is_active: boolean
  steps: SequenceStep[]
}

const PATH_CONFIG = {
  no_response: {
    label: "No responde",
    description: "El contacto no respondió al mensaje anterior",
    icon: XCircle,
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-200 dark:border-orange-800",
    badgeVariant: "outline" as const,
  },
  positive: {
    label: "Respuesta positiva",
    description: "Ej: 'Dale, contame', 'Me interesa', 'Agendemos'",
    icon: ThumbsUp,
    color: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-200 dark:border-green-800",
    badgeVariant: "outline" as const,
  },
  lukewarm: {
    label: "Respuesta tibia",
    description: "Ej: 'Ahora no', 'Más adelante', 'Dejame pensarlo'",
    icon: HelpCircle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    badgeVariant: "outline" as const,
  },
  negative: {
    label: "Respuesta negativa",
    description: "Ej: 'No me interesa', 'No es el momento'",
    icon: ThumbsDown,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    badgeVariant: "outline" as const,
  },
}

const DEFAULT_STEPS: SequenceStep[] = [
  // No response path - Email 2 en 3 días, Email 3 en 7 días, Email 4 en 14 días
  {
    step_number: 1,
    path: "no_response",
    wait_days: 3,
    message_template: "Follow-up breve. Consultá datos frescos de Seenka MCP sobre su industria o los clientes que maneja. Mencioná un insight nuevo que no usaste antes. Máximo 3 líneas.",
    message_tone: "casual",
    is_active: true,
  },
  {
    step_number: 2,
    path: "no_response",
    wait_days: 7,
    message_template: "Segundo follow-up. Traé datos de Seenka MCP sobre competencia o tendencias de inversión en su sector. Compartí valor sin pedir nada a cambio. Cerrá con 'cualquier cosa acá estoy'.",
    message_tone: "casual",
    is_active: true,
  },
  {
    step_number: 3,
    path: "no_response",
    wait_days: 14,
    message_template: "Último intento. Compartí un dato muy concreto de Seenka (ranking, % inversión, tendencia) que le sirva aunque no responda. Sin presión, dejá la puerta abierta para el futuro.",
    message_tone: "profesional",
    is_active: true,
  },
  // Positive path - Cupón + proponer llamada
  {
    step_number: 1,
    path: "positive",
    wait_days: 0,
    message_template: "Respondé con entusiasmo moderado. Ofrecé un beneficio especial/descuento por ser contacto directo. Proponé coordinar una call de 15 min para mostrarle los datos de su industria. Dá 2-3 opciones de horario.",
    message_tone: "entusiasta",
    is_active: true,
  },
  // Lukewarm/Neutral path - Más data de Seenka MCP
  {
    step_number: 1,
    path: "lukewarm",
    wait_days: 5,
    message_template: "Consultá Seenka MCP y traé datos nuevos y relevantes de su industria o sus clientes. Compartí insights de valor sin pedir reunión. Solo información útil que demuestre el valor de Seenka.",
    message_tone: "casual",
    is_active: true,
  },
  {
    step_number: 2,
    path: "lukewarm",
    wait_days: 10,
    message_template: "Segundo contacto neutral. Traé más datos de Seenka MCP, idealmente sobre competidores o tendencias recientes. Preguntá suavemente si le gustaría ver algo específico de su industria.",
    message_tone: "profesional",
    is_active: true,
  },
  // Negative path - Parar, reactivar en 3 meses
  {
    step_number: 1,
    path: "negative",
    wait_days: 0,
    message_template: "Cierre amable y breve. Agradecé el tiempo, no insistas. Una línea máximo: 'Entendido, gracias por tu tiempo. Quedo a disposición si en algún momento te sirve.'",
    message_tone: "respetuoso",
    is_active: true,
  },
  {
    step_number: 2,
    path: "negative",
    wait_days: 90,
    message_template: "Reactivación después de 3 meses. Consultá Seenka MCP por novedades de su industria. Retomá contacto mencionando algo que cambió en el mercado. Tono fresco, como si fuera un nuevo comienzo.",
    message_tone: "casual",
    is_active: true,
  },
]

export function SequenceBuilder() {
  const supabase = createClient()
  const [sequence, setSequence] = useState<Sequence | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"no_response" | "positive" | "lukewarm" | "negative">("no_response")

  useEffect(() => {
    loadSequence()
  }, [])

  const loadSequence = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Try to load existing sequence
      const { data: sequences } = await supabase
        .from("sequences")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)

      if (sequences && sequences.length > 0) {
        const seq = sequences[0]
        const { data: steps } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", seq.id)
          .order("step_number")

        setSequence({
          ...seq,
          steps: steps || [],
        })
      } else {
        // Create default sequence
        const { data: newSeq, error } = await supabase
          .from("sequences")
          .insert({ user_id: user.id, name: "Secuencia Principal" })
          .select()
          .single()

        if (newSeq && !error) {
          const stepsToInsert = DEFAULT_STEPS.map(s => ({
            ...s,
            sequence_id: newSeq.id,
          }))

          const { data: insertedSteps } = await supabase
            .from("sequence_steps")
            .insert(stepsToInsert)
            .select()

          setSequence({
            ...newSeq,
            steps: insertedSteps || [],
          })
        }
      }
    } catch (error) {
      console.error("Error loading sequence:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveStep = async () => {
    if (!editingStep || !sequence?.id) return

    setIsSaving(true)
    try {
      if (editingStep.id) {
        // Update existing
        await supabase
          .from("sequence_steps")
          .update({
            wait_days: editingStep.wait_days,
            message_template: editingStep.message_template,
            message_tone: editingStep.message_tone,
            is_active: editingStep.is_active,
          })
          .eq("id", editingStep.id)
      } else {
        // Insert new
        await supabase
          .from("sequence_steps")
          .insert({
            sequence_id: sequence.id,
            step_number: editingStep.step_number,
            path: editingStep.path,
            wait_days: editingStep.wait_days,
            message_template: editingStep.message_template,
            message_tone: editingStep.message_tone,
            is_active: editingStep.is_active,
          })
      }

      setEditDialogOpen(false)
      setEditingStep(null)
      await loadSequence()
    } catch (error) {
      console.error("Error saving step:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    try {
      await supabase.from("sequence_steps").delete().eq("id", stepId)
      await loadSequence()
    } catch (error) {
      console.error("Error deleting step:", error)
    }
  }

  const handleAddStep = (path: "no_response" | "positive" | "lukewarm" | "negative") => {
    if (!sequence) return
    const pathSteps = sequence.steps.filter(s => s.path === path)
    const maxStep = pathSteps.length > 0 ? Math.max(...pathSteps.map(s => s.step_number)) : 0

    setEditingStep({
      step_number: maxStep + 1,
      path,
      wait_days: path === "no_response" ? 5 : path === "lukewarm" ? 14 : 0,
      message_template: "",
      message_tone: "casual",
      is_active: true,
    })
    setEditDialogOpen(true)
  }

  const getStepsForPath = (path: string) => {
    if (!sequence) return []
    return sequence.steps.filter(s => s.path === path).sort((a, b) => a.step_number - b.step_number)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Secuencias de Mensajes</h1>
        <p className="text-muted-foreground mt-1">
          Configurá la estrategia de follow-up. La IA generará mensajes personalizados para cada champion usando sus datos, empresa, industria y triggers.
        </p>
      </div>

      {/* Explanation */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <GitBranch className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Esto no son mensajes fijos.</strong> Son instrucciones que la IA usa para generar mensajes personalizados para cada contacto.</p>
              <p>Cuando un champion entra en la secuencia, la IA toma estas instrucciones + los datos del champion (empresa, industria, triggers, insight de Seenka AI) y genera un mensaje único.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4 text-primary" />
              Mensaje Inicial
            </div>
            <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg] sm:rotate-0 hidden sm:block" />
            <ArrowDown className="h-5 w-5 text-muted-foreground sm:hidden" />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(["no_response", "positive", "lukewarm", "negative"] as const).map(path => {
                const config = PATH_CONFIG[path]
                const Icon = config.icon
                const stepCount = getStepsForPath(path).length
                return (
                  <button
                    key={path}
                    onClick={() => setActiveTab(path)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                      activeTab === path
                        ? `${config.borderColor} ${config.bgColor} font-medium`
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    <span>{config.label}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {stepCount}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active path steps */}
      {(["no_response", "positive", "lukewarm", "negative"] as const).map(path => {
        if (activeTab !== path) return null
        const config = PATH_CONFIG[path]
        const Icon = config.icon
        const steps = getStepsForPath(path)

        return (
          <div key={path} className="space-y-4">
            <div className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${config.bgColor}`}>
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">{config.label}</h2>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddStep(path)}
                  className="bg-transparent"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar paso
                </Button>
              </div>

              {steps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No hay pasos configurados para este camino</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 bg-transparent"
                    onClick={() => handleAddStep(path)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar primer paso
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div key={step.id || idx}>
                      {/* Connector */}
                      {idx > 0 && (
                        <div className="flex items-center justify-center py-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="h-6 w-px bg-border" />
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="text-xs">
                                Paso {step.step_number}
                              </Badge>
                              {step.wait_days > 0 && (
                                <Badge variant="outline" className="text-xs bg-transparent">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Esperar {step.wait_days} {step.wait_days === 1 ? "dia" : "dias"}
                                </Badge>
                              )}
                              {step.wait_days === 0 && (
                                <Badge variant="outline" className="text-xs bg-transparent">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Inmediato
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs bg-transparent">
                                Tono: {step.message_tone}
                              </Badge>
                            </div>
                            <div className="mt-1">
                              <p className="text-xs font-medium text-muted-foreground/70 mb-1">Estrategia para la IA:</p>
                              <p className="text-sm text-muted-foreground italic">&ldquo;{step.message_template}&rdquo;</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingStep(step)
                                setEditDialogOpen(true)
                              }}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            {step.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteStep(step.id!)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* End state for this path */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="h-px w-12 bg-border" />
              {path === "no_response" && (
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Se marca como "frio" - Recontactar en proxima efemeride
                </span>
              )}
              {path === "positive" && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Oportunidad - Call agendada o cupon enviado
                </span>
              )}
              {path === "lukewarm" && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Nurturing con datos de Seenka MCP
                </span>
              )}
              {path === "negative" && (
                <span className="flex items-center gap-1">
                  <Minus className="h-4 w-4" />
                  Pausado - Reactivar en 3 meses automaticamente
                </span>
              )}
              <div className="h-px w-12 bg-border" />
            </div>
          </div>
        )
      })}

      {/* Edit Step Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStep?.id ? "Editar paso" : "Nuevo paso"} - {editingStep ? PATH_CONFIG[editingStep.path].label : ""}
            </DialogTitle>
            <DialogDescription>
              Estas instrucciones le dicen a la IA qué estrategia usar. El mensaje final se genera personalizado para cada champion con sus datos reales.
            </DialogDescription>
          </DialogHeader>

          {editingStep && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Esperar (dias)</label>
                  <Input
                    type="number"
                    min={0}
                    value={editingStep.wait_days}
                    onChange={(e) => setEditingStep({
                      ...editingStep,
                      wait_days: parseInt(e.target.value) || 0,
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = responder inmediatamente
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tono del mensaje</label>
                  <Select
                    value={editingStep.message_tone}
                    onValueChange={(v) => setEditingStep({
                      ...editingStep,
                      message_tone: v,
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="entusiasta">Entusiasta</SelectItem>
                      <SelectItem value="profesional">Profesional</SelectItem>
                      <SelectItem value="respetuoso">Respetuoso</SelectItem>
                      <SelectItem value="directo">Directo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Estrategia / Instrucciones para la IA</label>
                <Textarea
                  rows={5}
                  placeholder="Ej: Mencioná un dato de inversión publicitaria de su industria. Proponé una call de 15 min. No seas insistente..."
                  value={editingStep.message_template}
                  onChange={(e) => setEditingStep({
                    ...editingStep,
                    message_template: e.target.value,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Escribí como si le dieras instrucciones a un vendedor. La IA usará esto + los datos del champion (empresa, industria, triggers, insight Seenka) para generar un mensaje único.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveStep} disabled={isSaving || !editingStep?.message_template?.trim()}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
