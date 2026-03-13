"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Send, RefreshCw, Thermometer } from "lucide-react"

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
  title: string | null
  company: string
}

interface Efemeride {
  id: string
  name: string
  manual_data: string | null
}

export default function TestConversationPage() {
  const [champions, setChampions] = useState<Champion[]>([])
  const [efemerides, setEfemerides] = useState<Efemeride[]>([])
  const [selectedChampion, setSelectedChampion] = useState<string>("")
  const [selectedEfemeride, setSelectedEfemeride] = useState<string>("")
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [customData, setCustomData] = useState("")
  
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [championsRes, efemeridesRes] = await Promise.all([
      supabase.from("champions").select("id, name, title, company").order("name").limit(50),
      supabase.from("efemerides").select("id, name, manual_data").eq("is_active", true).order("event_date")
    ])
    
    if (championsRes.data) setChampions(championsRes.data)
    if (efemeridesRes.data) setEfemerides(efemeridesRes.data)
  }

  async function generateFirstMessage() {
    if (!selectedChampion) {
      alert("Seleccioná un champion primero")
      return
    }

    setLoading(true)
    setMessages([])

    try {
      const efemeride = efemerides.find(e => e.id === selectedEfemeride)
      const seenkaData = customData || efemeride?.manual_data || "No hay data disponible"

      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion_id: selectedChampion,
          messages: [],
          seenka_data: seenkaData,
          efemeride_name: efemeride?.name || "Hot Sale"
        })
      })

      const data = await res.json()
      
      if (data.error) {
        alert("Error: " + data.error)
        return
      }

      setMessages([{
        role: "assistant",
        content: data.message,
        metadata: {
          temperatura: data.temperatura,
          accion: data.accion,
          razonamiento: data.razonamiento
        }
      }])
    } catch (err) {
      console.error(err)
      alert("Error al generar mensaje")
    } finally {
      setLoading(false)
    }
  }

  async function sendUserResponse() {
    if (!userInput.trim() || !selectedChampion) return

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userInput }
    ]
    setMessages(newMessages)
    setUserInput("")
    setLoading(true)

    try {
      const efemeride = efemerides.find(e => e.id === selectedEfemeride)
      const seenkaData = customData || efemeride?.manual_data || "No hay data disponible"

      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champion_id: selectedChampion,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          seenka_data: seenkaData,
          efemeride_name: efemeride?.name || "Hot Sale"
        })
      })

      const data = await res.json()
      
      if (data.error) {
        alert("Error: " + data.error)
        return
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.message,
          metadata: {
            temperatura: data.temperatura,
            accion: data.accion,
            razonamiento: data.razonamiento
          }
        }
      ])
    } catch (err) {
      console.error(err)
      alert("Error al generar respuesta")
    } finally {
      setLoading(false)
    }
  }

  function getTemperaturaBadge(temp?: string) {
    const colors: Record<string, string> = {
      caliente: "bg-red-500",
      tibio: "bg-yellow-500",
      frio: "bg-blue-500",
      negativo: "bg-gray-500",
      sin_respuesta: "bg-gray-400"
    }
    return colors[temp || "frio"] || "bg-gray-400"
  }

  function getAccionBadge(accion?: string) {
    const colors: Record<string, string> = {
      continuar: "bg-green-500",
      revelar_seenka: "bg-purple-500",
      ofrecer_trial: "bg-orange-500",
      stand_by: "bg-gray-500"
    }
    return colors[accion || "continuar"] || "bg-gray-400"
  }

  const selectedChampionData = champions.find(c => c.id === selectedChampion)

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Test de Conversación - Agente Gastón</h1>

      {/* Config */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Champion</label>
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
              <label className="text-sm font-medium mb-2 block">Efeméride (opcional)</label>
              <Select value={selectedEfemeride} onValueChange={setSelectedEfemeride}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar efeméride..." />
                </SelectTrigger>
                <SelectContent>
                  {efemerides.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.manual_data ? "(con data)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Data personalizada (opcional)</label>
            <Textarea
              value={customData}
              onChange={(e) => setCustomData(e.target.value)}
              placeholder="Pegá acá data de Seenka para usar en la conversación..."
              rows={3}
            />
          </div>

          <Button onClick={generateFirstMessage} disabled={loading || !selectedChampion}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generar primer mensaje
          </Button>
        </CardContent>
      </Card>

      {/* Conversation */}
      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Conversación con {selectedChampionData?.name}</span>
              <Button variant="outline" size="sm" onClick={() => setMessages([])}>
                Reiniciar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  }`}>
                    <div className="text-sm font-medium mb-1">
                      {msg.role === "user" ? selectedChampionData?.name : "Gastón"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {msg.metadata && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                        <div className="flex gap-2 flex-wrap">
                          <Badge className={`${getTemperaturaBadge(msg.metadata.temperatura)} text-white text-xs`}>
                            <Thermometer className="h-3 w-3 mr-1" />
                            {msg.metadata.temperatura}
                          </Badge>
                          <Badge className={`${getAccionBadge(msg.metadata.accion)} text-white text-xs`}>
                            {msg.metadata.accion}
                          </Badge>
                        </div>
                        {msg.metadata.razonamiento && (
                          <div className="text-xs text-muted-foreground italic">
                            {msg.metadata.razonamiento}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={`Respuesta de ${selectedChampionData?.name}...`}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendUserResponse()}
                disabled={loading}
              />
              <Button onClick={sendUserResponse} disabled={loading || !userInput.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
