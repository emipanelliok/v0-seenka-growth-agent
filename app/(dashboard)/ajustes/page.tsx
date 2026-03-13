"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, CheckCircle, Webhook, ExternalLink, Ghost, Brain, RotateCcw, Linkedin, ChevronRight, Settings2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"

const DEFAULT_MESSAGE_INSTRUCTIONS = `Sos una persona real que trabaja en Seenka (empresa de media intelligence). Escribí mensajes:
- En español argentino con tuteo (vos, tu, te)
- Informales y directos, como si fuera un colega
- Sin frases genéricas como "Vi tu publicación" o "Espero que estés bien"
- Enfocados en abrir conversación, no en vender
- Cortos para LinkedIn (máximo 280 caracteres)`

const DEFAULT_CHAMPION_CRITERIA = `Criterios para evaluar si alguien es buen champion para Seenka:

ALTO POTENCIAL:
- Trabaja en marketing, publicidad, medios o comunicación
- Rol de decisión: Director, Head, VP, CMO, CEO, Fundador
- Empresa mediana o grande (+50 empleados)
- Industria: Agencias, Medios, Retail, Consumo masivo, Entretenimiento
- Activo en LinkedIn (postea sobre industria)

MEDIO POTENCIAL:
- Rol relacionado pero no decisor (Manager, Coordinator)
- Empresa más chica
- Industria relacionada

BAJO POTENCIAL:
- Sin relación con marketing/medios
- Rol muy junior
- Industria no relevante (tech B2B, salud, educación, etc.)`

export default function AjustesPage() {
  const [webhookUrl, setWebhookUrl] = useState("")
  const [phantombusterApiKey, setPhantombusterApiKey] = useState("")
  const [phantombusterPhantomId, setPhantombusterPhantomId] = useState("")
  const [linkedinSessionCookie, setLinkedinSessionCookie] = useState("")
  const [messageInstructions, setMessageInstructions] = useState(DEFAULT_MESSAGE_INSTRUCTIONS)
  const [championCriteria, setChampionCriteria] = useState(DEFAULT_CHAMPION_CRITERIA)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .eq("user_id", user.id)

      if (data) {
        data.forEach((setting) => {
          if (setting.key === "make_webhook_url") setWebhookUrl(setting.value || "")
          if (setting.key === "phantombuster_api_key") setPhantombusterApiKey(setting.value || "")
          if (setting.key === "phantombuster_phantom_id") setPhantombusterPhantomId(setting.value || "")
          if (setting.key === "linkedin_session_cookie") setLinkedinSessionCookie(setting.value || "")
          if (setting.key === "ai_message_instructions") setMessageInstructions(setting.value || DEFAULT_MESSAGE_INSTRUCTIONS)
          if (setting.key === "ai_champion_criteria") setChampionCriteria(setting.value || DEFAULT_CHAMPION_CRITERIA)
        })
      }
    } catch {
      // No settings yet, that's ok
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setSaved(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No autenticado")

      const settings = [
        { key: "make_webhook_url", value: webhookUrl },
        { key: "phantombuster_api_key", value: phantombusterApiKey },
        { key: "phantombuster_phantom_id", value: phantombusterPhantomId },
        { key: "linkedin_session_cookie", value: linkedinSessionCookie },
        { key: "ai_message_instructions", value: messageInstructions },
        { key: "ai_champion_criteria", value: championCriteria },
      ]

      for (const setting of settings) {
        const { error: upsertError } = await supabase
          .from("settings")
          .upsert({
            user_id: user.id,
            key: setting.key,
            value: setting.value,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "user_id,key"
          })

        if (upsertError) throw upsertError
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setIsSaving(false)
    }
  }

  async function testWebhook() {
    if (!webhookUrl) {
      setError("Primero ingresá la URL del webhook")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/outreach/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error al probar webhook")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al probar webhook")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ajustes</h1>
            <p className="text-muted-foreground mt-1">Configurá tu cuenta y la plataforma</p>
          </div>
          <Link href="/ajustes/prompts">
            <Button variant="outline" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Prompts de IA
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
          <p className="text-muted-foreground">
            Configurá las integraciones para automatizar el envío de mensajes
          </p>
        </div>
        <Link href="/ajustes/prompts">
          <Button variant="outline" className="gap-2">
            <Brain className="h-4 w-4" />
            Prompts de IA
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook de Make
          </CardTitle>
          <CardDescription>
            Conectá con Make (Integromat) para automatizar el envío de mensajes a LinkedIn
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
            <p className="font-medium">Cómo configurar:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Andá a{" "}
                <a
                  href="https://www.make.com/en/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Make.com <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Creá un nuevo Scenario</li>
              <li>Agregá el módulo &quot;Webhooks &gt; Custom webhook&quot;</li>
              <li>Copiá la URL del webhook y pegala acá abajo</li>
              <li>Conectá el webhook con la herramienta que uses para LinkedIn (Expandi, Lemlist, etc.)</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook">URL del Webhook</Label>
            <Input
              id="webhook"
              type="url"
              placeholder="https://hook.make.com/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {saved && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Guardado correctamente
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
            <Button variant="outline" onClick={testWebhook} disabled={isSaving || !webhookUrl}>
              Probar Webhook
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Datos que se envían al webhook:</strong> nombre del champion, URL de LinkedIn, 
              mensaje generado, producto recomendado, canal (linkedin/email), insight, y datos del trigger.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ghost className="h-5 w-5" />
            Phantombuster
          </CardTitle>
          <CardDescription>
            Conectá con Phantombuster para enviar mensajes de LinkedIn automáticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
            <p className="font-medium">Cómo configurar:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Andá a{" "}
                <a
                  href="https://phantombuster.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Phantombuster.com <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Creá el Phantom &quot;LinkedIn Message Sender&quot;</li>
              <li>Conectá tu cuenta de LinkedIn en el Phantom</li>
              <li>Copiá tu API Key desde Settings &gt; API</li>
              <li>Copiá el Phantom ID desde la URL del Phantom</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phantombuster-api-key">API Key</Label>
            <Input
              id="phantombuster-api-key"
              type="password"
              placeholder="Tu API Key de Phantombuster"
              value={phantombusterApiKey}
              onChange={(e) => setPhantombusterApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phantombuster-phantom-id">Phantom ID</Label>
            <Input
              id="phantombuster-phantom-id"
              type="text"
              placeholder="706408567617077"
              value={phantombusterPhantomId}
              onChange={(e) => setPhantombusterPhantomId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Lo encontrás en la URL del Phantom: phantombuster.com/.../phantoms/<strong>706408567617077</strong>/...
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedin-session-cookie">LinkedIn Session Cookie (li_at)</Label>
            <Input
              id="linkedin-session-cookie"
              type="password"
              placeholder="AQEFAHMBAAAABCKGhAAAAGZe..."
              value={linkedinSessionCookie}
              onChange={(e) => setLinkedinSessionCookie(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Para obtenerla: Abrí LinkedIn en Chrome, presioná F12, andá a Application &gt; Cookies &gt; linkedin.com, 
              y copiá el valor de <strong>li_at</strong>
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Configuración de IA
          </CardTitle>
          <CardDescription>
            Personalizá cómo la IA genera mensajes y evalúa champions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="message-instructions">Instrucciones para mensajes</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setMessageInstructions(DEFAULT_MESSAGE_INSTRUCTIONS)}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restaurar
              </Button>
            </div>
            <Textarea
              id="message-instructions"
              placeholder="Instrucciones para la IA..."
              value={messageInstructions}
              onChange={(e) => setMessageInstructions(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Estas instrucciones se usan cuando la IA genera mensajes personalizados para contactar champions.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="champion-criteria">Criterios para calificar champions</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setChampionCriteria(DEFAULT_CHAMPION_CRITERIA)}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restaurar
              </Button>
            </div>
            <Textarea
              id="champion-criteria"
              placeholder="Criterios de calificación..."
              value={championCriteria}
              onChange={(e) => setChampionCriteria(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Estos criterios se usan para evaluar prospectos en la importación masiva y determinar su potencial.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {saved && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Guardado correctamente
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar configuración de IA
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z"/>
            </svg>
            Configuracion de Email (Resend)
          </CardTitle>
          <CardDescription>
            Servicio para enviar emails a los champions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <p className="font-medium text-emerald-800 dark:text-emerald-200">Dominio verificado ✓</p>
            </div>
            <p className="text-emerald-700 dark:text-emerald-300">
              Tu dominio <strong>aiwknd.com</strong> está verificado y configurado. 
              Puedes enviar emails a cualquier destinatario.
            </p>
          </div>
          
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p className="font-medium">Configuracion activa:</p>
            <div className="space-y-1 font-mono text-xs">
              <p><span className="text-emerald-600">✓ RESEND_API_KEY</span> = configurada</p>
              <p><span className="text-emerald-600">✓ RESEND_FROM_DOMAIN</span> = aiwknd.com</p>
            </div>
          </div>

          <div className="p-3 bg-muted rounded text-sm">
            <p className="text-muted-foreground">
              Los emails se enviarán desde <code className="bg-background px-1.5 py-0.5 rounded text-xs">outreach@aiwknd.com</code> (o el email configurado en ajustes).
            </p>
          </div>

          <Button variant="outline" asChild>
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Dashboard de Resend
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook de Respuestas de Email
          </CardTitle>
          <CardDescription>
            Conecta para recibir respuestas de email automaticamente y avanzar secuencias
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm space-y-3">
            <p className="font-medium">URL del webhook:</p>
            <code className="block bg-background border rounded px-3 py-2 text-xs break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/email-reply` : "/api/webhooks/email-reply"}
            </code>
            <p className="text-muted-foreground">
              Configura este webhook en Make/Zapier para enviar las respuestas de email. 
              El sistema detecta automaticamente el champion, analiza el sentimiento y avanza la secuencia.
            </p>
          </div>
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p className="font-medium">Formato esperado (JSON):</p>
            <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">{`{
  "from_email": "contacto@empresa.com",
  "subject": "Re: Tu mensaje",
  "body": "Contenido del email..."
}`}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5" />
            Campos de LinkedIn
          </CardTitle>
          <CardDescription>
            Configurá qué campos de LinkedIn se muestran y cómo se mapean a la base de datos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Cuando importás un champion desde LinkedIn, Proxycurl trae más de 40 campos. 
            Acá podés elegir cuáles mostrar y cómo mapearlos.
          </p>
          <Button asChild>
            <Link href="/ajustes/campos-linkedin">
              Configurar campos
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
