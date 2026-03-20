import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

export const maxDuration = 30

const SERPER_API_KEY = process.env.SERPER_API_KEY

interface SocialProfile {
  platform: string
  url: string
  handle?: string
  confidence: "high" | "medium" | "low"
}

interface EnrichmentResult {
  profiles: SocialProfile[]
  phone?: string
  personal_email?: string
  bio?: string
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { championId } = await request.json()
    if (!championId) {
      return NextResponse.json({ error: "championId requerido" }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get champion data
    const { data: champion, error: champError } = await admin
      .from("champions")
      .select("id, name, email, role, company, country, linkedin_url, linkedin_data, social_profiles")
      .eq("id", championId)
      .single()

    if (champError || !champion) {
      return NextResponse.json({ error: "Champion no encontrado" }, { status: 404 })
    }

    if (!SERPER_API_KEY) {
      return NextResponse.json({ error: "SERPER_API_KEY no configurada. Registrate gratis en serper.dev" }, { status: 500 })
    }

    // Build search queries
    const name = champion.name
    const company = champion.company || ""
    const country = champion.country || ""

    // Search for social profiles across platforms
    const platforms = [
      { name: "Instagram", query: `"${name}" ${company} instagram.com`, urlPattern: "instagram.com/" },
      { name: "Twitter/X", query: `"${name}" ${company} (twitter.com OR x.com)`, urlPattern: "twitter.com/|x.com/" },
      { name: "Facebook", query: `"${name}" ${company} facebook.com`, urlPattern: "facebook.com/" },
      { name: "TikTok", query: `"${name}" ${company} tiktok.com`, urlPattern: "tiktok.com/@" },
      { name: "YouTube", query: `"${name}" ${company} youtube.com`, urlPattern: "youtube.com/" },
      { name: "GitHub", query: `"${name}" ${company} github.com`, urlPattern: "github.com/" },
    ]

    // Run searches in parallel (max 3 concurrent to avoid rate limits)
    const searchResults: Array<{ platform: string; results: any[] }> = []

    for (let i = 0; i < platforms.length; i += 3) {
      const batch = platforms.slice(i, i + 3)
      const batchResults = await Promise.all(
        batch.map(async (p) => {
          try {
            const results = await webSearch(p.query, 5)
            return { platform: p.name, results }
          } catch (err) {
            console.error(`[enrich-social] Error searching ${p.name}:`, err)
            return { platform: p.name, results: [] }
          }
        })
      )
      searchResults.push(...batchResults)
    }

    // Also search for general info (phone, bio, etc.)
    let generalResults: any[] = []
    try {
      generalResults = await webSearch(`"${name}" ${company} ${country}`, 10)
    } catch (err) {
      console.error("[enrich-social] Error in general search:", err)
    }

    // Use Claude to analyze all results and extract the right profiles
    const analysisPrompt = buildAnalysisPrompt(champion, searchResults, generalResults)

    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-20250514"),
      prompt: analysisPrompt,
      maxTokens: 1500,
    })

    // Parse LLM response
    const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    let enrichment: EnrichmentResult

    try {
      enrichment = JSON.parse(cleanedText)
    } catch {
      console.error("[enrich-social] Failed to parse LLM response:", cleanedText)
      return NextResponse.json({ error: "Error analizando resultados" }, { status: 500 })
    }

    // Merge with existing data from linkedin_data (PDL may have twitter, facebook, github)
    const existingLinkedinData = champion.linkedin_data || {}
    const existingSocial = champion.social_profiles || {}

    const socialProfiles: Record<string, any> = { ...existingSocial }

    // Add profiles from PDL/existing data if not already found
    if (existingLinkedinData.twitter_url && !socialProfiles.twitter) {
      socialProfiles.twitter = { url: existingLinkedinData.twitter_url, source: "pdl", confidence: "high" }
    }
    if (existingLinkedinData.facebook_url && !socialProfiles.facebook) {
      socialProfiles.facebook = { url: existingLinkedinData.facebook_url, source: "pdl", confidence: "high" }
    }
    if (existingLinkedinData.github_url && !socialProfiles.github) {
      socialProfiles.github = { url: existingLinkedinData.github_url, source: "pdl", confidence: "high" }
    }

    // Add new profiles from Brave + Claude analysis
    for (const profile of enrichment.profiles) {
      const key = profile.platform.toLowerCase().replace(/[^a-z]/g, "")
      // Only add if confidence is medium or high, and not already present with high confidence
      if (
        (profile.confidence === "high" || profile.confidence === "medium") &&
        (!socialProfiles[key] || socialProfiles[key].confidence !== "high")
      ) {
        socialProfiles[key] = {
          url: profile.url,
          handle: profile.handle || null,
          source: "brave_search",
          confidence: profile.confidence,
          found_at: new Date().toISOString(),
        }
      }
    }

    // Build champion updates
    const updates: Record<string, any> = {
      social_profiles: socialProfiles,
    }

    // Add phone if found and missing
    if (enrichment.phone && !champion.linkedin_data?.phone) {
      // Store phone in a dedicated field if it exists, or in linkedin_data
      updates.phone = enrichment.phone
    }

    // Save to database
    const { error: updateError } = await admin
      .from("champions")
      .update(updates)
      .eq("id", championId)

    if (updateError) {
      console.error("[enrich-social] Error updating champion:", updateError)
      return NextResponse.json({ error: "Error guardando datos" }, { status: 500 })
    }

    console.log("[enrich-social] Champion enriched:", champion.name, "Profiles found:", Object.keys(socialProfiles).length)

    return NextResponse.json({
      status: "success",
      profiles: socialProfiles,
      phone: enrichment.phone || null,
      bio: enrichment.bio || null,
    })
  } catch (error) {
    console.error("[enrich-social] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Serper.dev Google Search API
async function webSearch(query: string, count: number = 5): Promise<any[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: count,
    }),
  })

  if (!response.ok) {
    throw new Error(`Serper error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return (data.organic || []).map((r: any) => ({
    title: r.title,
    url: r.link,
    description: r.snippet,
  }))
}

function buildAnalysisPrompt(
  champion: any,
  searchResults: Array<{ platform: string; results: any[] }>,
  generalResults: any[]
): string {
  const searchSummary = searchResults
    .map((sr) => {
      if (sr.results.length === 0) return `${sr.platform}: Sin resultados`
      return `${sr.platform}:\n${sr.results
        .map((r, i) => `  ${i + 1}. ${r.title}\n     URL: ${r.url}\n     ${r.description?.substring(0, 150) || ""}`)
        .join("\n")}`
    })
    .join("\n\n")

  const generalSummary = generalResults.length > 0
    ? generalResults
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description?.substring(0, 150) || ""}`)
        .join("\n")
    : "Sin resultados"

  return `Analizá los resultados de búsqueda y determiná qué perfiles de redes sociales pertenecen a esta persona.

PERSONA:
- Nombre: ${champion.name}
- Cargo: ${champion.role || "no especificado"}
- Empresa: ${champion.company || "no especificada"}
- País: ${champion.country || "no especificado"}
- Email: ${champion.email || "no especificado"}
- LinkedIn: ${champion.linkedin_url || "no especificado"}

RESULTADOS DE BÚSQUEDA POR PLATAFORMA:

${searchSummary}

RESULTADOS GENERALES:
${generalSummary}

RESPONDÉ EN JSON:
{
  "profiles": [
    {
      "platform": "instagram|twitterx|facebook|tiktok|youtube|github",
      "url": "URL completa del perfil",
      "handle": "@usuario si se detecta",
      "confidence": "high|medium|low"
    }
  ],
  "phone": "teléfono si aparece en los resultados, null si no",
  "personal_email": "email personal si aparece, null si no",
  "bio": "resumen breve de la persona basado en lo encontrado, null si no hay suficiente info"
}

REGLAS:
- Solo incluí perfiles que tengan ALTA probabilidad de pertenecer a esta persona exacta
- "high" = el nombre, empresa o contexto profesional coincide claramente
- "medium" = el nombre coincide pero no hay confirmación de empresa/contexto
- "low" = podría ser otra persona con el mismo nombre (NO incluir estos)
- NO incluyas perfiles genéricos de empresa, solo perfiles PERSONALES
- Si un resultado es claramente de otra persona con el mismo nombre, descartalo
- Para Twitter/X, normalizá la URL a x.com
- El handle debe incluir @

Respondé SOLO el JSON, sin markdown ni texto extra.`
}
