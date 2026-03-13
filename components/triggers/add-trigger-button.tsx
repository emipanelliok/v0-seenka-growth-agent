"use client"

import React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { TriggerType, TriggerEvaluation } from "@/lib/types"
import { TRIGGER_TYPE_LABELS, SEENKA_PRODUCTS } from "@/lib/types"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Sparkles, Loader2, CheckCircle, XCircle, Link2, FileText, UserPlus, Share2, User, Star } from "lucide-react"

interface Champion {
  id: string
  name: string
  company?: string | null
  industry?: string | null
}

interface AddTriggerButtonProps {
  champions: Champion[]
}

export function AddTriggerButton({ champions }: AddTriggerButtonProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<TriggerEvaluation | null>(null)
  const [championId, setChampionId] = useState<string>("")
  const [type, setType] = useState<TriggerType>("post")
  const [sourceText, setSourceText] = useState("")
  const [url, setUrl] = useState("")
  const [inputMode, setInputMode] = useState<"url" | "text">("url")
  
  // Shared post fields
  const [championComment, setChampionComment] = useState("")
  const [originalAuthorName, setOriginalAuthorName] = useState("")
  const [originalAuthorLinkedin, setOriginalAuthorLinkedin] = useState("")
  const [originalAuthorRole, setOriginalAuthorRole] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  
  const router = useRouter()

  const selectedChampion = champions.find((c) => c.id === championId)

  const handleExtractUrl = async () => {
    if (!url.trim()) {
      setError("Ingresa una URL")
      return
    }

    setIsExtracting(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        throw new Error("Error al extraer contenido de la URL")
      }

      const data = await response.json()
      
      if (data.extracted_content) {
        setSourceText(data.extracted_content)
        handleEvaluateWithContent(data.extracted_content)
      } else {
        setError("No se pudo extraer contenido. Por favor, pega el texto manualmente.")
        setInputMode("text")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al extraer")
      setInputMode("text")
    } finally {
      setIsExtracting(false)
    }
  }

  const handleEvaluateWithContent = async (content: string) => {
    if (!content.trim()) {
      setError("Ingresa el contenido a evaluar")
      return
    }

    setIsEvaluating(true)
    setError(null)
    setEvaluation(null)

    try {
      // For shared posts, combine champion comment + original content for evaluation
      const fullContent = type === "shared" 
        ? `[Comentario del champion]: ${championComment}\n\n[Post original de ${originalAuthorName || "autor"}]: ${content}`
        : content

      const response = await fetch("/api/ai/evaluate-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_text: fullContent,
          champion_name: selectedChampion?.name,
          champion_company: selectedChampion?.company,
          champion_industry: selectedChampion?.industry,
          is_shared_post: type === "shared",
          original_author_name: originalAuthorName,
        }),
      })

      if (!response.ok) {
        throw new Error("Error al evaluar el trigger")
      }

      const data = await response.json()
      setEvaluation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al evaluar")
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleEvaluate = () => {
    const contentToEvaluate = type === "shared" ? originalContent : sourceText
    handleEvaluateWithContent(contentToEvaluate)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!championId) {
      setError("Selecciona un champion")
      return
    }

    const contentToSave = type === "shared" ? originalContent : sourceText
    if (!contentToSave.trim()) {
      setError("Ingresa el contenido del trigger")
      return
    }

    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    // Check if content mentions Seenka
    const mentionsSeenka = (originalContent + championComment).toLowerCase().includes("seenka")

    const triggerData: Record<string, unknown> = {
      champion_id: championId,
      type,
      source_text: type === "shared" 
        ? `${championComment}\n\n---\n\n${originalContent}`
        : sourceText,
      topic: evaluation?.topic || null,
      severity: evaluation?.severity || "medium",
      is_worth_contacting: evaluation?.is_worth_contacting || false,
      recommended_products: evaluation?.recommended_products || null,
      product_reasoning: evaluation?.product_reasoning || null,
      mentioned_people: evaluation?.mentioned_people || null,
    }

    // Add shared post fields if applicable
    if (type === "shared") {
      triggerData.champion_comment = championComment || null
      triggerData.original_author_name = originalAuthorName || null
      triggerData.original_author_linkedin = originalAuthorLinkedin || null
      triggerData.original_author_role = originalAuthorRole || null
      triggerData.original_content = originalContent || null
      triggerData.mentions_seenka = mentionsSeenka
    }

    const { error: insertError } = await supabase.from("triggers").insert(triggerData)

    if (insertError) {
      setError(insertError.message)
      setIsLoading(false)
      return
    }

    // Update champion status if worth contacting
    if (evaluation?.is_worth_contacting) {
      await supabase
        .from("champions")
        .update({ status: "trigger_detected" })
        .eq("id", championId)
    }

    setIsLoading(false)
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const handleAddMentionedPerson = async (person: { name: string; role?: string | null; company?: string | null }) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return

    const { error: insertError } = await supabase.from("champions").insert({
      user_id: user.id,
      name: person.name,
      role: person.role,
      company: person.company,
      champion_level: "medium",
      status: "listening",
    })

    if (!insertError) {
      router.refresh()
    }
  }

  const handleAddOriginalAuthor = async () => {
    if (!originalAuthorName) return
    
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return

    const { error: insertError } = await supabase.from("champions").insert({
      user_id: user.id,
      name: originalAuthorName,
      role: originalAuthorRole || null,
      linkedin_url: originalAuthorLinkedin || null,
      champion_level: "medium",
      status: "listening",
    })

    if (!insertError) {
      router.refresh()
    }
  }

  const resetForm = () => {
    setChampionId("")
    setType("post")
    setSourceText("")
    setUrl("")
    setEvaluation(null)
    setError(null)
    setInputMode("url")
    setChampionComment("")
    setOriginalAuthorName("")
    setOriginalAuthorLinkedin("")
    setOriginalAuthorRole("")
    setOriginalContent("")
  }

  const isSharedPost = type === "shared"

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) resetForm()
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Trigger
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar Trigger</DialogTitle>
          <DialogDescription>
            {isSharedPost 
              ? "Registra un post que tu champion compartió. Captura tanto su comentario como el contenido original."
              : "Pega una URL de LinkedIn o el contenido directamente. La IA analizará si vale la pena contactar."
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="champion">Champion *</Label>
              <Select value={championId} onValueChange={setChampionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar champion" />
                </SelectTrigger>
                <SelectContent>
                  {champions.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No hay champions disponibles
                    </SelectItem>
                  ) : (
                    champions.map((champion) => (
                      <SelectItem key={champion.id} value={champion.id}>
                        {champion.name}
                        {champion.company && ` - ${champion.company}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Tipo de Trigger</Label>
              <Select value={type} onValueChange={(v) => setType(v as TriggerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        {value === "shared" && <Share2 className="h-4 w-4" />}
                        {label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Shared Post Form */}
            {isSharedPost ? (
              <div className="space-y-4">
                {/* Champion's Comment */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Comentario del Champion
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Lo que tu champion escribió al compartir el post
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Ej: Muchas veces solo analizamos el SOI competitivo..."
                      value={championComment}
                      onChange={(e) => setChampionComment(e.target.value)}
                      rows={3}
                    />
                  </CardContent>
                </Card>

                {/* Original Author */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Autor Original
                    </CardTitle>
                    <CardDescription className="text-xs">
                      La persona cuyo post fue compartido (potencial nuevo champion)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre *</Label>
                        <Input
                          placeholder="Valeria Beola"
                          value={originalAuthorName}
                          onChange={(e) => setOriginalAuthorName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rol</Label>
                        <Input
                          placeholder="Advertising & Media Expert"
                          value={originalAuthorRole}
                          onChange={(e) => setOriginalAuthorRole(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">LinkedIn URL</Label>
                      <Input
                        placeholder="https://linkedin.com/in/valeriabeola"
                        value={originalAuthorLinkedin}
                        onChange={(e) => setOriginalAuthorLinkedin(e.target.value)}
                      />
                    </div>
                    {originalAuthorName && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddOriginalAuthor}
                        className="w-full bg-transparent"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Agregar {originalAuthorName} como Champion
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Original Content */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Contenido Original
                    </CardTitle>
                    <CardDescription className="text-xs">
                      El post original que fue compartido
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Pega aquí el contenido del post original..."
                      value={originalContent}
                      onChange={(e) => setOriginalContent(e.target.value)}
                      rows={6}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Regular Post Form */
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "url" | "text")} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="url" className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Desde URL
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Pegar Texto
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="url">URL del Post</Label>
                    <div className="flex gap-2">
                      <Input
                        id="url"
                        placeholder="https://linkedin.com/posts/..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleExtractUrl}
                        disabled={isExtracting || !url.trim()}
                      >
                        {isExtracting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Extraer"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pega la URL de un post de LinkedIn y extraeremos el contenido automáticamente
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="text" className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="source_text">Contenido *</Label>
                    <Textarea
                      id="source_text"
                      placeholder="Pega aquí el post de LinkedIn, dato de Seenka, o contexto de mercado..."
                      value={sourceText}
                      onChange={(e) => setSourceText(e.target.value)}
                      rows={5}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Extracted content preview (for non-shared posts) */}
            {!isSharedPost && sourceText && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Contenido extraído:</p>
                <p className="text-sm line-clamp-3">{sourceText}</p>
              </div>
            )}

            {/* Evaluate Button */}
            <Button
              type="button"
              variant="secondary"
              onClick={handleEvaluate}
              disabled={isEvaluating || (isSharedPost ? !originalContent.trim() : !sourceText.trim())}
              className="w-full"
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Evaluando con IA...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Evaluar con IA
                </>
              )}
            </Button>

            {/* Evaluation Results */}
            {evaluation && (
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {evaluation.is_worth_contacting ? (
                    <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Vale la pena contactar
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="mr-1 h-3 w-3" />
                      No es momento de contactar
                    </Badge>
                  )}
                  <Badge variant="outline" className={
                    evaluation.severity === "high" ? "border-red-500/50 text-red-600" :
                    evaluation.severity === "medium" ? "border-amber-500/50 text-amber-600" :
                    "border-muted-foreground/50"
                  }>
                    Severidad: {evaluation.severity === "high" ? "Alta" : evaluation.severity === "medium" ? "Media" : "Baja"}
                  </Badge>
                  {isSharedPost && (originalContent + championComment).toLowerCase().includes("seenka") && (
                    <Badge className="bg-primary/20 text-primary border-primary/30">
                      Menciona Seenka
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium">Tema identificado</p>
                  <p className="text-sm text-muted-foreground">{evaluation.topic}</p>
                </div>

                <div>
                  <p className="text-sm font-medium">Razonamiento</p>
                  <p className="text-sm text-muted-foreground">{evaluation.reasoning}</p>
                </div>

                {evaluation.recommended_products && evaluation.recommended_products.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Productos recomendados</p>
                    <div className="flex flex-wrap gap-2">
                      {evaluation.recommended_products.map((productKey) => {
                        const product = SEENKA_PRODUCTS[productKey]
                        return (
                          <Badge key={productKey} className="bg-primary/10 text-primary border-primary/20">
                            {product?.name || productKey}
                          </Badge>
                        )
                      })}
                    </div>
                    {evaluation.product_reasoning && (
                      <p className="text-sm text-muted-foreground mt-2">{evaluation.product_reasoning}</p>
                    )}
                  </div>
                )}

                {evaluation.mentioned_people && evaluation.mentioned_people.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Personas mencionadas</p>
                    <div className="space-y-2">
                      {evaluation.mentioned_people.map((person, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div>
                            <p className="text-sm font-medium">{person.name}</p>
                            {(person.role || person.company) && (
                              <p className="text-xs text-muted-foreground">
                                {[person.role, person.company].filter(Boolean).join(" @ ")}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddMentionedPerson(person)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Agregar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !championId || (isSharedPost ? !originalContent.trim() : !sourceText.trim())}
            >
              {isLoading ? "Guardando..." : "Guardar Trigger"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
