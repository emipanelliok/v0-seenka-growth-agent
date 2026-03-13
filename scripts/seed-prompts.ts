import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROMPTS = [
  {
    key: "efemeride-message",
    name: "Mensaje de Efeméride",
    description: "Genera mensajes de outreach para efemérides",
    category: "outreach",
    defaultPrompt: `Sos un especialista en marketing y ventas B2B. Vas a generar un email corto y directo para contactar un potencial cliente (prospect).

CONTEXTO:
- Champion: {champion_name}, {champion_title} en {champion_company}
- Efeméride: {efemeride_name}
- Dato de Seenka: {insight}
- Etapa: {stage} (cold/warm/reengagement)
- Instrucciones especiales: {custom_instructions}

GENERA UN EMAIL QUE:
1. Sea corto (máximo 3-4 líneas)
2. Mencione un dato específico de la efeméride/competencia
3. Proponga valor sin pedir reunión todavía
4. Cierre con una pregunta o CTA suave
5. No uses saludos genéricos ni clichés
6. Tono: profesional pero cercano, como de colega

Responde SOLO el cuerpo del email, sin subject line.`
  },
  {
    key: "generate-reply-suggestion",
    name: "Sugerencia de Respuesta",
    description: "Analiza respuesta de champion y genera respuesta personalizada",
    category: "responses",
    defaultPrompt: `Eres un agente de ventas experto de Seenka. Analiza la respuesta del champion y responde en JSON.

CONTEXTO:
- Champion: {champion_name} ({champion_company})
- Su respuesta: {reply_content}
- Último mensaje que le enviamos: {last_message}

ANALIZA Y RESPONDE EN JSON:
{
  "intent": "qué quiere (mas_info, quien_es_seenka, agendar_llamada, no_interesado, etc)",
  "sentiment": "positive|negative|neutral",
  "action": "qué hacer (send_more_info, explain_seenka, schedule_call, close_lost, etc)",
  "reasoning": "explicación breve",
  "generatedResponse": "respuesta personalizada (null si action es close_lost)",
  "suggestedSubject": "asunto sugerido"
}

REGLAS:
- Si pregunta quién es Seenka: explica brevemente
- Si muestra interés: propone llamada
- Si dice "no es momento": cierra amable
- Si no está interesado: no generes respuesta`
  },
  {
    key: "analyze-company",
    name: "Analizar Empresa",
    description: "Analiza información de empresa del champion",
    category: "enrichment",
    defaultPrompt: `Analiza la empresa y responde en JSON con estructura:
{
  "description": "descripción breve de qué hace",
  "main_products": ["producto1", "producto2"],
  "target_market": "mercado objetivo",
  "size": "pequeña|mediana|grande",
  "growth_potential": "alto|medio|bajo"
}`
  },
  {
    key: "analyze-profile",
    name: "Analizar Perfil",
    description: "Genera resumen del perfil del champion",
    category: "enrichment",
    defaultPrompt: `Analiza el perfil del champion y genera un resumen breve que incluya:
- Rol y responsabilidades
- Seniority (junior|mid|senior|executive)
- Áreas de expertise
- Potencial de decisión (bajo|medio|alto)`
  },
  {
    key: "evaluate-trigger",
    name: "Evaluar Trigger",
    description: "Evalúa si un trigger vale la pena contactar",
    category: "triggers",
    defaultPrompt: `Evalúa si este trigger es relevante para contactar al champion. Responde en JSON:
{
  "is_relevant": true|false,
  "relevance_score": 0-100,
  "reasoning": "explicación",
  "suggested_angle": "ángulo de contacto sugerido"
}`
  }
]

async function seedPrompts() {
  try {
    // Get the first user (for testing) or you can pass user_id
    const { data: { users } } = await supabase.auth.admin.listUsers()
    
    if (!users || users.length === 0) {
      console.log("No users found. Create a user first.")
      return
    }

    const userId = users[0].id
    console.log(`Seeding prompts for user: ${userId}`)

    for (const prompt of PROMPTS) {
      const { error } = await supabase
        .from("prompts")
        .upsert({
          user_id: userId,
          key: prompt.key,
          name: prompt.name,
          description: prompt.description,
          category: prompt.category,
          prompt_text: prompt.defaultPrompt,
          default_prompt_text: prompt.defaultPrompt,
          is_active: true
        }, {
          onConflict: "user_id,key"
        })

      if (error) {
        console.error(`Error seeding ${prompt.key}:`, error)
      } else {
        console.log(`✓ Seeded ${prompt.key}`)
      }
    }

    console.log("Done!")
  } catch (err) {
    console.error("Error:", err)
  }
}

seedPrompts()
