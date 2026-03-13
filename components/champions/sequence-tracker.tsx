"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Champion, Company } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
  Play,
  Copy,
  Check,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Clock,
  XCircle,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  Pause,
  SkipForward,
} from "lucide-react"

interface Enrollment {
  id: string
  sequence_id: string
  current_step: number
  current_path: string
  status: string
  last_message_sent_at: string | null
  next_action_at: string | null
}

interface SequenceMessage {
  id: string
  step_number: number
  path: string
  message_text: string
  sent_at: string
  response_type: string | null
  response_text: string | null
  responded_at: string | null
}

interface SequenceStep {
  id: string
  step_number: number
  path: string
  wait_days: number
  message_template: string
  message_tone: string
}

interface SequenceTrackerProps {
  champion: Champion
  companyData: Company | null
}

const PATH_LABELS: Record<string, { label: string; color: string; icon: typeof ThumbsUp }> = {
  no_response: { label: "Sin respuesta", color: "text-orange-500", icon: XCircle },
  positive: { label: "Positiva", color: "text-green-500", icon: ThumbsUp },
  lukewarm: { label: "Tibia", color: "text-yellow-500", icon: Minus },
  negative: { label: "Negativa", color: "text-red-500", icon: ThumbsDown },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activa", color: "bg-green-500" },
  paused: { label: "Pausada", color: "bg-yellow-500" },
  completed: { label: "Completada", color: "bg-blue-500" },
  cold: { label: "Frío", color: "bg-gray-500" },
}

export function SequenceTracker({ champion, companyData }: SequenceTrackerProps) {
  const supabase = createClient()
  const router = useRouter()

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [messages, setMessages] = useState<SequenceMessage[]>([])
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedMessage, setGeneratedMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [responseDialogOpen, setResponseDialogOpen] = useState(false)
  const [selectedResponseType, setSelectedResponseType] = useState<string>("")
  const [responseText, setResponseText] = useState("")
  const [isSavingResponse, setIsSavingResponse] = useState(false)
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null)

  useEffect(() => {
    loadEnrollment()
  }, [champion.id])

  const loadEnrollment = async () => {
    setLoading(true)
    try {
      // Get enrollment for this champion
      const { data: enrollments } = await supabase
        .from("sequence_enrollments")
        .select("*")
        .eq("champion_id", champion.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)

      if (enrollments && enrollments.length > 0) {
        const enr = enrollments[0]
        setEnrollment(enr)

        // Load messages
        const { data: msgs } = await supabase
          .from("sequence_messages")
          .select("*")
          .eq("enrollment_id", enr.id)
          .order("sent_at", { ascending: true })

        if (msgs) setMessages(msgs)

        // Load sequence steps
        const { data: stps } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", enr.sequence_id)
          .eq("is_active", true)
          .order("step_number", { ascending: true })

        if (stps) setSteps(stps)
      } else {
        setEnrollment(null)
        setMessages([])
      }
    } catch (error) {
      console.error("Error loading enrollment:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartSequence = async () => {
    setIsEnrolling(true)
    try {
      // Find active sequence
      const { data: sequences } = await supabase
        .from("sequences")
        .select("id")
        .eq("is_active", true)
        .limit(1)

      if (!sequences || sequences.length === 0) {
        alert("No hay secuencias configuradas. Andá a Secuencias para crear una.")
        return
      }

      const sequenceId = sequences[0].id

      // Create enrollment
      const { data: newEnrollment, error } = await supabase
        .from("sequence_enrollments")
        .insert({
          champion_id: champion.id,
          sequence_id: sequenceId,
          current_step: 1,
          current_path: "no_response",
          status: "active",
        })
        .select()
        .single()

      if (error) throw error

      setEnrollment(newEnrollment)

      // Load steps
      const { data: stps } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId)
        .eq("is_active", true)
        .order("step_number", { ascending: true })

      if (stps) setSteps(stps)
    } catch (error) {
      console.error("Error starting sequence:", error)
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleGenerateMessage = async () => {
    if (!enrollment) return

    setIsGenerating(true)
    setGeneratedMessage("")

    try {
      // Find the current step
      const currentStep = steps.find(
        s => s.path === enrollment.current_path && s.step_number === enrollment.current_step
      )

      if (!currentStep) {
        setGeneratedMessage("No hay un paso configurado para esta situación. Andá a Secuencias para configurarlo.")
        return
      }

      const response = await fetch("/api/ai/sequence-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion_name: champion.name,
          champion_role: champion.role,
          champion_company: champion.company,
          champion_industry: companyData?.industry || champion.industry,
          champion_sector: companyData?.sector,
          seenka_ai_insight: champion.seenka_ai_insight,
          company_pain_points: companyData?.pain_points,
          company_sales_angle: companyData?.sales_angle,
          previous_messages: messages.map(m => ({
            step: m.step_number,
            path: m.path,
            text: m.message_text,
            response: m.response_text,
          })),
          response_text: messages.length > 0 ? messages[messages.length - 1].response_text : null,
          response_type: enrollment.current_path,
          step_strategy: currentStep.message_template,
          step_tone: currentStep.message_tone,
          step_number: currentStep.step_number,
          path: enrollment.current_path,
        }),
      })

      if (!response.ok) throw new Error("Error generating message")

      const data = await response.json()
      setGeneratedMessage(data.message)
    } catch (error) {
      console.error("Error generating message:", error)
      setGeneratedMessage("Error al generar el mensaje. Intentá de nuevo.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(generatedMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMarkSent = async () => {
    if (!enrollment || !generatedMessage) return

    try {
      // Save the message
      const { data: msg, error } = await supabase
        .from("sequence_messages")
        .insert({
          enrollment_id: enrollment.id,
          step_number: enrollment.current_step,
          path: enrollment.current_path,
          message_text: generatedMessage,
        })
        .select()
        .single()

      if (error) throw error

      // Update enrollment
      await supabase
        .from("sequence_enrollments")
        .update({
          last_message_sent_at: new Date().toISOString(),
          next_action_at: getNextActionDate(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id)

      setCurrentMessageId(msg.id)
      setMessages([...messages, msg])
      setGeneratedMessage("")
      router.refresh()
    } catch (error) {
      console.error("Error marking sent:", error)
    }
  }

  const getNextActionDate = () => {
    const currentStep = steps.find(
      s => s.path === enrollment?.current_path && s.step_number === enrollment?.current_step
    )
    const days = currentStep?.wait_days || 5
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString()
  }

  const handleOpenResponseDialog = (messageId: string) => {
    setCurrentMessageId(messageId)
    setSelectedResponseType("")
    setResponseText("")
    setResponseDialogOpen(true)
  }

  const handleSaveResponse = async () => {
    if (!enrollment || !currentMessageId || !selectedResponseType) return

    setIsSavingResponse(true)
    try {
      // Update the message with the response
      await supabase
        .from("sequence_messages")
        .update({
          response_type: selectedResponseType,
          response_text: responseText || null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", currentMessageId)

      // Determine next step
      let newPath = selectedResponseType
      let newStep = 1
      let newStatus = "active"

      if (selectedResponseType === "no_response") {
        // Stay on no_response path, advance step
        newPath = "no_response"
        const nextStepNum = enrollment.current_step + 1
        const hasNextStep = steps.some(s => s.path === "no_response" && s.step_number === nextStepNum)
        if (hasNextStep) {
          newStep = nextStepNum
        } else {
          newStatus = "cold" // No more steps, mark as cold
        }
      } else if (selectedResponseType === "positive") {
        const hasPositiveStep = steps.some(s => s.path === "positive" && s.step_number === 1)
        if (hasPositiveStep) {
          newPath = "positive"
          newStep = 1
        } else {
          newStatus = "completed"
        }
      } else if (selectedResponseType === "lukewarm") {
        const hasLukewarmStep = steps.some(s => s.path === "lukewarm" && s.step_number === 1)
        if (hasLukewarmStep) {
          newPath = "lukewarm"
          newStep = 1
        } else {
          newStatus = "paused"
        }
      } else if (selectedResponseType === "negative") {
        const hasNegativeStep = steps.some(s => s.path === "negative" && s.step_number === 1)
        if (hasNegativeStep) {
          newPath = "negative"
          newStep = 1
        } else {
          newStatus = "cold"
        }
      }

      // Update enrollment
      await supabase
        .from("sequence_enrollments")
        .update({
          current_path: newPath,
          current_step: newStep,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id)

      setResponseDialogOpen(false)
      await loadEnrollment()
      router.refresh()
    } catch (error) {
      console.error("Error saving response:", error)
    } finally {
      setIsSavingResponse(false)
    }
  }

  const getDaysUntilAction = () => {
    if (!enrollment?.next_action_at) return null
    const now = new Date()
    const next = new Date(enrollment.next_action_at)
    const diff = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const getLastUnrespondedMessage = () => {
    return messages.find(m => !m.response_type)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Not enrolled - Show start button
  if (!enrollment) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="rounded-full bg-primary/10 p-3">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold">Secuencia de mensajes</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Iniciá una secuencia para hacer follow-up con {champion.name}
            </p>
          </div>
          <Button onClick={handleStartSequence} disabled={isEnrolling}>
            {isEnrolling ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Iniciar secuencia
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Enrolled - show tracker
  const statusInfo = STATUS_LABELS[enrollment.status] || STATUS_LABELS.active
  const pathInfo = PATH_LABELS[enrollment.current_path] || PATH_LABELS.no_response
  const PathIcon = pathInfo.icon
  const daysUntilAction = getDaysUntilAction()
  const lastUnrespondedMsg = getLastUnrespondedMessage()
  const isSequenceFinished = enrollment.status === "cold" || enrollment.status === "completed"

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Secuencia de Follow-up
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <span className={`h-2 w-2 rounded-full ${statusInfo.color}`} />
                {statusInfo.label}
              </Badge>
              <Badge variant="outline" className={pathInfo.color}>
                <PathIcon className="mr-1 h-3 w-3" />
                {pathInfo.label}
              </Badge>
            </div>
          </div>
          <CardDescription>
            Paso {enrollment.current_step} - {pathInfo.label}
            {daysUntilAction !== null && daysUntilAction > 0 && enrollment.status === "active" && (
              <span className="ml-2">
                (siguiente accion en {daysUntilAction} {daysUntilAction === 1 ? "dia" : "dias"})
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Timeline of messages */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial</p>
              {messages.map((msg, i) => (
                <div key={msg.id} className="relative pl-6 pb-3 border-l-2 border-muted last:border-l-0">
                  <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-background border-2 border-primary" />
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      Paso {msg.step_number} - {PATH_LABELS[msg.path]?.label || msg.path}
                      <span className="text-muted-foreground/50">
                        {new Date(msg.sent_at).toLocaleDateString("es-AR")}
                      </span>
                    </div>
                    
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm">{msg.message_text}</p>
                    </div>

                    {msg.response_type ? (
                      <div className="ml-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <ArrowRight className="h-3 w-3" />
                          Respuesta: <span className={PATH_LABELS[msg.response_type]?.color || ""}>{PATH_LABELS[msg.response_type]?.label || msg.response_type}</span>
                        </div>
                        {msg.response_text && (
                          <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                            <p className="text-sm italic">&ldquo;{msg.response_text}&rdquo;</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenResponseDialog(msg.id)}
                      >
                        <Clock className="mr-2 h-3 w-3" />
                        Marcar respuesta
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action area */}
          {!isSequenceFinished && (
            <div className="border-t pt-4 space-y-3">
              {/* If there's an unresponded message, prompt to mark response */}
              {lastUnrespondedMsg ? (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">Esperando respuesta de {champion.name}</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Revisá LinkedIn y marcá cómo respondió para que la secuencia avance.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleOpenResponseDialog(lastUnrespondedMsg.id)}
                  >
                    Marcar respuesta
                  </Button>
                </div>
              ) : (
                <>
                  {/* Generate next message */}
                  {!generatedMessage ? (
                    <Button onClick={handleGenerateMessage} disabled={isGenerating} className="w-full">
                      {isGenerating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="mr-2 h-4 w-4" />
                      )}
                      {isGenerating ? "Generando mensaje..." : "Generar siguiente mensaje"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Mensaje generado - Paso {enrollment.current_step} ({pathInfo.label})
                      </p>
                      <div className="bg-muted/50 rounded-lg p-4">
                        <p className="text-sm">{generatedMessage}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={handleCopyMessage}>
                          {copied ? (
                            <Check className="mr-2 h-3 w-3" />
                          ) : (
                            <Copy className="mr-2 h-3 w-3" />
                          )}
                          {copied ? "Copiado" : "Copiar"}
                        </Button>
                        <Button size="sm" onClick={handleMarkSent}>
                          <Check className="mr-2 h-3 w-3" />
                          Marcar como enviado
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleGenerateMessage}>
                          Regenerar
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sequence finished */}
          {isSequenceFinished && (
            <div className={`rounded-lg p-4 text-center ${
              enrollment.status === "completed" 
                ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" 
                : "bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-800"
            }`}>
              {enrollment.status === "completed" ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="font-medium text-green-800 dark:text-green-400">Secuencia completada</p>
                  <p className="text-sm text-green-700 dark:text-green-500">El contacto respondió positivamente</p>
                </>
              ) : (
                <>
                  <XCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="font-medium text-muted-foreground">Contacto frío</p>
                  <p className="text-sm text-muted-foreground">Se agotaron los pasos sin respuesta positiva</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Response dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como respondio {champion.name}?</DialogTitle>
            <DialogDescription>
              Seleccioná el tipo de respuesta para que la secuencia avance al siguiente paso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Response type buttons */}
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PATH_LABELS).map(([key, info]) => {
                const Icon = info.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedResponseType(key)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      selectedResponseType === key
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/20"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${info.color}`} />
                    <span className="text-sm font-medium">{info.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Response text (optional) */}
            {selectedResponseType && selectedResponseType !== "no_response" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Que te dijo? (opcional, mejora el siguiente mensaje)
                </label>
                <Textarea
                  placeholder="Pegá acá lo que te respondió por LinkedIn..."
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveResponse}
              disabled={!selectedResponseType || isSavingResponse}
            >
              {isSavingResponse ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
