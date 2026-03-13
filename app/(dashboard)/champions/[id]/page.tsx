import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { ChampionDetail } from "@/components/champions/champion-detail"
import type { Champion, Trigger, Interaction } from "@/lib/types"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ChampionDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: champion, error } = await supabase
    .from("champions")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !champion) {
    notFound()
  }

  const [triggersRes, interactionsRes] = await Promise.all([
    supabase
      .from("triggers")
      .select("*")
      .eq("champion_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("*")
      .eq("champion_id", id)
      .order("created_at", { ascending: false }),
  ])

  return (
    <ChampionDetail
      champion={champion as Champion}
      triggers={(triggersRes.data || []) as Trigger[]}
      interactions={(interactionsRes.data || []) as Interaction[]}
    />
  )
}
