"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Send, RefreshCw } from "lucide-react"

interface Message {
  role: "user" | "assistant"
  content: string
  metadata?: {
    temperatura?: string
    accion?: string
    razonamiento?: string
  }
}

interface Champion {
  id: string
  name: string
  role: string | null
  company: string
  industry: string | null
}

interface Efemeride {
  id: string
  name: string
  manual_data: string | null
}

interface ConversationClientProps {
  initialChampions: Champion[]
  initialEfemerides: Efemeride[]
}

export default function ConversationClient({ 
  initialChampions, 
  initialEfemerides 
}: ConversationClientProps) {
  const [champions] = useState<Champion[]>(initialChampions)
  const [efemerides] = useState<Efemeride[]>(initialEfemerides)
  const [selectedChampion, setSelectedChampion] = useState<string>("")
  const [selectedEfemeride, setSelectedEfemeride] = useState<string>("")
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [customData, setCustomData] = useState("")

  const selectedChampionData = champions.find(c => c.id === selectedChampion)
  const selectedEfemeridesData = efemerides.find(e => e.id === selectedEfemeride)

  const generateFirstMessage = async () => {
    if (!selectedChampion || !selectedEfemeridesData) return

    setLoading(true)
    try {
      const seenkaData = customData || selectedEfemeridesData.manual_data || ""
      
      const response = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion: {
            id: selectedChampion,
            name: selectedChampionData?.name,
            role: selectedChampionData?.role,
            company: selectedChampionData?.company,
            industry: selectedChampionData?.industry,
          },
          efemeride: {
            name: selectedEfemeridesData.name,
          },
          conversation_history: [],
          seenka_data: seenkaData,
        }),
      })

      const data = await response.json()
      
      setMessages([
        {
          role: "assistant",
          content: data.message,
          metadata: {
            temperatura: data.temperatura,
            accion: data.accion,
            razonamiento: data.razonamiento,
          },
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!userInput.trim() || !selectedChampion) return

    const newMessages = [
      ...messages,
      { role: "user" as const, content: userInput },
    ]
    setMessages(newMessages)
    setUserInput("")
    setLoading(true)

    try {
      const seenkaData = customData || selectedEfemeridesData?.manual_data || ""
      
      const response = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion: {
            id: selectedChampion,
            name: selectedChampionData?.name,
            role: selectedChampionData?.role,
            company: selectedChampionData?.company,
            industry: selectedChampionData?.industry,
          },
          efemeride: {
            name: selectedEfemeridesData?.name,
          },
          conversation_history: newMessages,
          seenka_data: seenkaData,
        }),
      })

      const data = await response.json()
      
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.message,
          metadata: {
            temperatura: data.temperatura,
            accion: data.accion,
            razonamiento: data.razonamiento,
          },
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Test Conversación - Gastón</h1>
          <p className="text-muted-foreground">Prueba el agente conversacional con champions reales</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Champion ({champions.length} disponibles)</label>
                <Select value={selectedChampion} onValueChange={setSelectedChampion}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar champion..." />
                  </SelectTrigger>
                  <SelectContent>
                    {champions.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} - {c.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Efeméride ({efemerides.length} disponibles)</label>
                <Select value={selectedEfemeride} onValueChange={setSelectedEfemeride}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar efeméride..." />
                  </SelectTrigger>
                  <SelectContent>
                    {efemerides.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Data personalizada (opcional)</label>
              <Textarea
                placeholder="Pegá data de Seenka aquí si querés usar diferente a la efeméride..."
                value={customData}
                onChange={(e) => setCustomData(e.target.value)}
                className="h-24"
              />
            </div>

            <Button
              onClick={generateFirstMessage}
              disabled={!selectedChampion || !selectedEfemeride || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Generar Primer Mensaje
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {messages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Conversación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg ${
                      msg.role === "user"
                        ? "bg-blue-50 dark:bg-blue-950 ml-8"
                        : "bg-gray-50 dark:bg-gray-900 mr-8"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">
                          {msg.role === "user" ? "Tú" : "Gastón"}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.metadata && msg.role === "assistant" && (
                        <div className="flex gap-2">
                          <Badge variant="outline">{msg.metadata.temperatura}</Badge>
                          <Badge variant="secondary">{msg.metadata.accion}</Badge>
                        </div>
                      )}
                    </div>
                    {msg.metadata?.razonamiento && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Razonamiento: {msg.metadata.razonamiento}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Escribí la respuesta del champion..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  disabled={loading}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!userInput.trim() || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
