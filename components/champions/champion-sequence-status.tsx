"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, GitBranch, ThumbsUp, ThumbsDown, Minus, XCircle } from "lucide-react"

interface ChampionSequenceStatusProps {
  championId: string
  championName: string
}

const PATH_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  positive: { label: "Positiva", icon: ThumbsUp, color: "text-green-500" },
  negative: { label: "Negativa", icon: ThumbsDown, color: "text-red-500" },
  lukewarm: { label: "Tibia", icon: Minus, color: "text-yellow-500" },
  no_response: { label: "Sin respuesta", icon: XCircle, color: "text-orange-500" },
}

export function ChampionSequenceStatus({ championId, championName }: ChampionSequenceStatusProps) {
  const supabase = createClient()
  const [sequence, setSequence] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSequence()
  }, [championId])

  const loadSequence = async () => {
    try {
      const { data } = await supabase
        .from("champion_sequences")
        .select("id, status, current_step, metadata, started_at")
        .eq("champion_id", championId)
        .neq("status", "completed")
        .neq("status", "stopped")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      setSequence(data)
    } catch (error) {
      console.log("[v0] No sequence found for champion")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!sequence) {
    return null
  }

  const path = sequence.metadata?.path || "no_response"
  const pathInfo = PATH_LABELS[path] || PATH_LABELS.no_response
  const PathIcon = pathInfo.icon

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Secuencia Activa
          </CardTitle>
          <Badge variant="secondary" className={`gap-1 ${pathInfo.color}`}>
            <PathIcon className="h-3 w-3" />
            {pathInfo.label}
          </Badge>
        </div>
        <CardDescription>
          Basada en respuesta: <span className="font-medium">{sequence.metadata?.sentiment_trigger || "pendiente"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className="capitalize">{sequence.status}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paso actual:</span>
          <span className="font-medium">{sequence.current_step}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Los emails se enviarán automáticamente según el tipo de respuesta recibida.
        </div>
      </CardContent>
    </Card>
  )
}
