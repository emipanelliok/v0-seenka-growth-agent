import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { champion_id, draft, channel } = await request.json()

    if (!champion_id || !draft) {
      return NextResponse.json({ error: "champion_id y draft requeridos" }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get champion info
    const { data: champ } = await admin
      .from("champions")
      .select("*, champion_clients(client_name)")
      .eq("id", champion_id)
      .single()

    if (!champ) return NextResponse.json({ error: "Champion no encontrado" }, { status: 404 })

    const championClients = champ?.champion_clients?.map((c: any) => c.client_name).join(", ") || "no especificados"
    const isLinkedIn = channel === "linkedin"

    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      prompt: `Sos Gastón, agente de inteligencia publicitaria de Seenka. Seenka monitorea en tiempo real qué comunican las marcas en TV, digital y radio en Latinoamérica.

CONTEXTO:
- Estás hablando con ${champ.name || "esta persona"} (${champ.title || champ.role || "ejecutivo"} en ${champ.company || "su empresa"})
- Clientes que maneja: ${championClients}
- Canal: ${isLinkedIn ? "LinkedIn" : "Email"}

El usuario escribió este borrador de mensaje y necesita que lo mejores con tu estilo:

BORRADOR:
${draft}

REESCRIBILO siguiendo estas reglas:
- Español argentino con voseo
- Sin emojis
- Máx ${isLinkedIn ? "60" : "80"} palabras
- Tono profesional pero cercano
- Si mencionan créditos, usá seenka.com/refer + generá un código tipo G seguido de 7 caracteres alfanuméricos random
- Si el borrador menciona una reunión, ofrecela como opcional, no como requisito
${isLinkedIn ? "- Sin firma (LinkedIn ya la muestra)" : "- Firmá como 'Gastón\\nSeenka Media Intelligence'"}
- Mantené la intención del borrador pero hacelo más atractivo y natural

Respondé SOLO el mensaje reescrito, sin explicaciones ni comillas.`,
      maxTokens: 500,
    })

    return NextResponse.json({ rewritten: text.trim() })

  } catch (error) {
    console.error("[rewrite] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
