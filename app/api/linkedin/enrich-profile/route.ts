import { NextResponse } from "next/server"
import { CHAMPION_TYPE_KEYWORDS, type ChampionType } from "@/lib/types"

export async function POST(request: Request) {
  try {
    const { linkedinUrl } = await request.json()

    if (!linkedinUrl) {
      return NextResponse.json(
        { error: "URL de LinkedIn requerida" },
        { status: 400 }
      )
    }

    const apiKey = process.env.PILOTERR_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "PILOTERR_API_KEY no configurada. Agregala en las variables de entorno." },
        { status: 500 }
      )
    }

    // Extract LinkedIn username from URL
    const username = extractLinkedInUsername(linkedinUrl)
    if (!username) {
      return NextResponse.json(
        { error: "URL de LinkedIn inválida. Debe ser como: linkedin.com/in/usuario" },
        { status: 400 }
      )
    }

    const apiUrl = `https://piloterr.com/api/v2/linkedin/profile/info?query=${username}`

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Accept": "application/json"
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Piloterr] Error:", response.status, errorText)
      return NextResponse.json(
        { error: `Error de Piloterr: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const profile = data.profile || data

    // Transform experiences to our format
    const experiences = profile.experiences?.filter((exp: any) => exp.company).map((exp: any) => ({
      title: exp.title || null,
      company: exp.company || "",
      company_url: exp.company_url || null,
      location: exp.location || null,
      start_date: exp.start_at || null,
      end_date: exp.end_date || null,
      description: exp.description || null,
      is_current: !exp.end_date
    })) || []

    // Transform educations to our format
    const educations = profile.educations?.filter((edu: any) => edu.school).map((edu: any) => ({
      school: edu.school || "",
      degree: edu.degree || null,
      field_of_study: edu.field_of_study || null,
      start_date: edu.start_at || null,
      end_date: edu.end_at || null
    })) || []

    // Transform similar profiles from people_also_viewed
    const similarProfiles = profile.people_also_viewed?.slice(0, 5).map((sp: any) => ({
      name: sp.name || "",
      headline: sp.summary || null,
      url: sp.url || "",
      location: sp.location || null
    })) || []

    // Extract languages
    const languages = profile.languages?.map((lang: any) => 
      typeof lang === 'string' ? lang : lang.name || lang.language
    ).filter(Boolean) || []

    // Get current position from card_current_position or first experience
    const currentCompany = profile.card_current_position?.name || 
      profile.experiences?.find((e: any) => e.company)?.company || null

    // Extract role: try multiple sources
    const extractedRole = extractCurrentRole(profile.experiences) || 
      profile.occupation || 
      profile.headline || 
      null

    // Auto-detect champion type from role/headline
    const detectedType = detectChampionType(extractedRole, profile.headline)

    // Transform the response to our champion format
    const enrichedData = {
      name: profile.full_name || null,
      role: extractedRole,
      company: currentCompany,
      champion_type: detectedType,
      industry: profile.industry || null,
      country: profile.address?.country || null,
      headline: profile.headline || null,
      summary: profile.summary || null,
      photo_url: profile.photo_url || null,
      website_url: profile.website_url || null,
      follower_count: profile.follower_count || null,
      connection_count: profile.connection_count || null,
      languages: languages,
      experiences: experiences,
      educations: educations,
      similar_profiles: similarProfiles,
      // Store ALL raw LinkedIn data for flexible field access
      linkedin_data: {
        ...profile,
        _enriched_at: new Date().toISOString(),
        _source: "piloterr"
      }
    }

    return NextResponse.json(enrichedData)
  } catch (error) {
    console.error("[Enrich Profile] Error:", error)
    return NextResponse.json(
      { error: "Error al enriquecer el perfil" },
      { status: 500 }
    )
  }
}

function extractLinkedInUsername(url: string): string | null {
  // Handle various LinkedIn URL formats
  const patterns = [
    /linkedin\.com\/in\/([^\/\?]+)/i,
    /^([^\/\?]+)$/ // Just the username directly
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return null
}

function detectChampionType(role: string | null, headline: string | null): ChampionType {
  const text = `${role || ""} ${headline || ""}`.toLowerCase()
  
  if (!text.trim()) return "other"

  // Check each type's keywords (order matters: more specific first)
  const typeOrder: ChampionType[] = ["creative", "media", "strategy", "sales", "marketing"]
  
  for (const type of typeOrder) {
    const keywords = CHAMPION_TYPE_KEYWORDS[type]
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return type
      }
    }
  }
  
  return "other"
}

function extractCurrentRole(experiences: any[] | undefined): string | null {
  if (!experiences || experiences.length === 0) return null
  
  // Find current job (no end date or most recent)
  const currentJob = experiences.find((exp: any) => 
    !exp.end_date || exp.end_date === "Present"
  ) || experiences[0]
  
  return currentJob?.title || null
}

function extractCurrentCompany(experiences: any[] | undefined): string | null {
  if (!experiences || experiences.length === 0) return null
  
  // Find current job (no end date or most recent)
  const currentJob = experiences.find((exp: any) => 
    !exp.end_date || exp.end_date === "Present"
  ) || experiences[0]
  
  return currentJob?.company || null
}
