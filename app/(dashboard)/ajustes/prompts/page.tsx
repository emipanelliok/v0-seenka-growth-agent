'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, RotateCcw, Save, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Prompt = {
  id: string
  key: string
  name: string
  description: string
  category: string
  prompt_text: string
  default_prompt_text: string
  is_active: boolean
  updated_at: string
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [editedText, setEditedText] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const supabase = createClient()

  // Load prompts
  useEffect(() => {
    const loadPrompts = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true })

      console.log("[v0] Prompts query result:", { data, error })
      if (error) {
        console.error('Error loading prompts:', error)
        setMessage({ type: 'error', text: `Error cargando prompts: ${error.message}` })
      } else {
        console.log("[v0] Prompts loaded:", data?.length || 0)
        setPrompts(data || [])
        if (data && data.length > 0) {
          selectPrompt(data[0])
        }
      }
      setLoading(false)
    }

    loadPrompts()
  }, [])

  const selectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setEditedText(prompt.prompt_text)
    setHasChanges(false)
  }

  const handleTextChange = (value: string) => {
    setEditedText(value)
    setHasChanges(selectedPrompt?.prompt_text !== value)
  }

  const savePrompt = async () => {
    if (!selectedPrompt) return

    setSaving(true)
    const { error } = await supabase
      .from('prompts')
      .update({ prompt_text: editedText, updated_at: new Date().toISOString() })
      .eq('id', selectedPrompt.id)

    if (error) {
      setMessage({ type: 'error', text: 'Error guardando prompt' })
    } else {
      setMessage({ type: 'success', text: 'Prompt guardado correctamente' })
      setSelectedPrompt({ ...selectedPrompt, prompt_text: editedText })
      setHasChanges(false)
      // Update local state
      setPrompts(
        prompts.map((p) =>
          p.id === selectedPrompt.id ? { ...p, prompt_text: editedText } : p
        )
      )
    }
    setSaving(false)

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000)
  }

  const resetPrompt = () => {
    if (!selectedPrompt) return
    setEditedText(selectedPrompt.default_prompt_text)
    setHasChanges(selectedPrompt.prompt_text !== selectedPrompt.default_prompt_text)
  }

  const groupedPrompts = prompts.reduce(
    (acc, prompt) => {
      if (!acc[prompt.category]) {
        acc[prompt.category] = []
      }
      acc[prompt.category].push(prompt)
      return acc
    },
    {} as Record<string, Prompt[]>
  )

  const categories = Object.keys(groupedPrompts).sort()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prompts de IA</h1>
          <p className="text-muted-foreground mt-1">
            Personaliza los prompts que usa la IA para generar contenido
          </p>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar con lista de prompts */}
        <div className="lg:col-span-1">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay prompts disponibles</p>
              <p className="text-xs mt-2">Los prompts deberían sincronizarse automáticamente</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {categories.map((category) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase px-2">
                    {category}
                  </h3>
                  {groupedPrompts[category].map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => selectPrompt(prompt)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition ${
                        selectedPrompt?.id === prompt.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{prompt.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {prompt.description}
                          </p>
                        </div>
                        {hasChanges && selectedPrompt?.id === prompt.id && (
                          <div className="h-2 w-2 rounded-full bg-yellow-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {selectedPrompt ? (
            <Card className="p-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold">{selectedPrompt.name}</h2>
                <p className="text-muted-foreground">{selectedPrompt.description}</p>
                <div className="flex gap-2 mt-2">
                  <Badge>{selectedPrompt.category}</Badge>
                  {selectedPrompt.is_active && (
                    <Badge variant="outline" className="bg-green-50">
                      Activo
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Prompt</label>
                <Textarea
                  value={editedText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Última actualización: {new Date(selectedPrompt.updated_at).toLocaleString()}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={savePrompt}
                  disabled={!hasChanges || saving}
                  className="gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Guardar cambios
                    </>
                  )}
                </Button>
                <Button
                  onClick={resetPrompt}
                  variant="outline"
                  className="gap-2"
                  disabled={editedText === selectedPrompt.default_prompt_text}
                >
                  <RotateCcw className="h-4 w-4" />
                  Restablecer a default
                </Button>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Los cambios se aplican inmediatamente a todos los nuevos mensajes generados.
                </AlertDescription>
              </Alert>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              No hay prompts disponibles
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
