import { createClient } from "@/lib/supabase/server"
import ConversationClient from "./conversation-client"

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

// Server Component - carga datos con admin client (bypassa RLS)
export default async function TestConversationPage() {
  const supabase = await createClient()
  
  // Obtener user para verificar auth
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return <div className="p-6 text-center">No autenticado</div>
  }

  // Traer champions sin restricción RLS usando el server client
  const { data: champions, error: championsError } = await supabase
    .from("champions")
    .select("id, name, title, company")
    .order("name")

  const { data: efemerides, error: efemeridesError } = await supabase
    .from("efemerides")
    .select("id, name, manual_data")
    .eq("is_active", true)
    .order("event_date")

  console.log("[v0] Server - Champions loaded:", champions?.length, championsError)
  console.log("[v0] Server - Efemerides loaded:", efemerides?.length, efemeridesError)

  return (
    <ConversationClient 
      initialChampions={champions || []}
      initialEfemerides={efemerides || []}
    />
  )
}
