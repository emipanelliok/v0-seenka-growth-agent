import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { generateText, generateObject } from "ai"
import { z } from "zod"
import { getNomenclatorText } from "@/lib/seenka-nomenclator"

const CompanyAnalysisSchema = z.object({
  industry: z.string(),
  sector: z.string(),
  size: z.enum(["Startup", "PyME", "Mediana", "Grande", "Enterprise"]),
  pain_points: z.array(z.string()),
  sales_angle: z.string(),
  description: z.string(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { champion_id } = await request.json()
  if (!champion_id) return NextResponse.json({ error: "champion_id required" }, { status: 400 })

  const { data: champion, error: fetchError } = await supabase
    .from("champions")
    .select("*")
    .eq("id", champion_id)
    .single()

  if (fetchError || !champion) {
    return NextResponse.json({ error: "Champion not found" }, { status: 404 })
  }

  await supabase
    .from("champions")
    .update({ enrichment_status: "enriching", enrichment_error: null })
    .eq("id", champion_id)

  const errors: string[] = []
  let enrichedData: any = null

  // Decodificar URL por si ya tiene caracteres encoded (evitar double-encoding)
  let rawLinkedinUrl: string | null = null
  if (champion.linkedin_url) {
    try {
      rawLinkedinUrl = decodeURIComponent(champion.linkedin_url).replace(/\/$/, "").split("?")[0]
    } catch {
      rawLinkedinUrl = champion.linkedin_url.replace(/\/$/, "").split("?")[0]
    }
  }

  // =============================
  // PASO 1: Apollo.io enrichment (primary), PDL fallback handled below
  // =============================
  const detectType = (role: string | null, headline: string | null) => {
    const text = `${role || ""} ${headline || ""}`.toLowerCase()
    const types: Record<string, string[]> = {
      creative: ["creativ", "direc.*arte", "art director", "copywriter", "redactor", "diseñ", "design", "planner", "brand"],
      media: ["media", "medios", "planning", "trader", "programmatic", "digital media", "investment"],
      marketing: ["marketing", "mkt", "brand manager", "product manager", "growth", "comunicaci"],
      sales: ["sales", "ventas", "comercial", "account exec", "business develop", "revenue"],
      strategy: ["strateg", "insight", "research", "analista", "analytics", "data"],
    }
    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some((kw) => new RegExp(kw, "i").test(text))) return type
    }
    return "other"
  }

  try {
    const apolloKey = process.env.APOLLO_API_KEY
    if (apolloKey && rawLinkedinUrl) {
      let apolloResponse: Response | null = null
      try {
        apolloResponse = await fetch("https://api.apollo.io/api/v1/people/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apolloKey,
          },
          body: JSON.stringify({ linkedin_url: rawLinkedinUrl }),
        })
      } catch (fetchErr) {
        errors.push(`Apollo fetch: ${(fetchErr as Error).message}`)
      }

      if (apolloResponse?.ok) {
        const apolloResult = await apolloResponse.json()
        const p = apolloResult?.person
        if (p) {
          const role = p.title || ""
          const company = p.organization_name || p.organization?.name || ""
          const headline = p.headline || role
          const country = p.country || p.city || null

          const experiences = (p.employment_history || []).map((e: any) => ({
            title: e.title || "",
            company: e.organization_name || "",
            starts_at: e.start_date || null,
            ends_at: e.end_date || "Actual",
            is_current: e.current || false,
          }))

          enrichedData = {
            name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
            email: p.email || null,
            role,
            company,
            country,
            headline,
            summary: null,
            photo_url: p.photo_url || null,
            website_url: null,
            follower_count: null,
            connection_count: null,
            languages: null,
            experiences: experiences.length > 0 ? experiences : null,
            educations: null,
            similar_profiles: null,
            linkedin_data: apolloResult,
            champion_type: detectType(role, headline),
          }
        } else {
          errors.push("Apollo: persona no encontrada")
        }
      } else if (apolloResponse && !apolloResponse.ok) {
        errors.push(`Apollo: error ${apolloResponse.status}`)
      }
    } else if (!process.env.APOLLO_API_KEY) {
      errors.push("Apollo: APOLLO_API_KEY no configurada")
    }
  } catch (err) {
    errors.push(`Apollo: ${(err as Error).message}`)
  }

  // Merge datos de Apollo con champion existente
  const mergedRole = enrichedData?.role || champion.role
  const mergedHeadline = enrichedData?.headline || champion.headline
  const mergedCompany = enrichedData?.company || champion.company
  const mergedCountry = enrichedData?.country || champion.country

  // =============================
  // PASO 2: Analyze Company con GPT
  // =============================
  let companyId = champion.company_id
  if (mergedCompany && !champion.company_id) {
    try {
      const normalizedName = mergedCompany.toLowerCase().trim().replace(/\s+/g, " ")
      const { data: existingCompanies } = await supabase
        .from("companies")
        .select("*")
        .eq("normalized_name", normalizedName)

      if (existingCompanies && existingCompanies.length > 0) {
        companyId = existingCompanies[0].id
      } else {
        const nomenclatorText = getNomenclatorText()
        const { object: analysis } = await generateObject({
          model: "openai/gpt-4o-mini",
          schema: CompanyAnalysisSchema,
          prompt: `Sos un experto en clasificación de empresas para Seenka, una empresa de media intelligence de Argentina.

${nomenclatorText}

PRODUCTO: Creative Sense - Biblioteca de publicidades con IA para buscar, analizar y comparar campañas publicitarias.

EMPRESA: ${mergedCompany}
${mergedRole ? `Rol del contacto: ${mergedRole}` : ""}
${mergedHeadline ? `Headline: ${mergedHeadline}` : ""}

Clasificá esta empresa usando el nomenclador. Respondé en español.`,
        })

        const { data: newCompany } = await supabase
          .from("companies")
          .insert({
            name: mergedCompany,
            normalized_name: normalizedName,
            industry: analysis.industry,
            sector: analysis.sector,
            size: analysis.size,
            description: analysis.description,
            pain_points: analysis.pain_points,
            sales_angle: analysis.sales_angle,
            analyzed_at: new Date().toISOString(),
          })
          .select()
          .single()

        companyId = newCompany?.id || null
      }
    } catch (err) {
      errors.push(`Company Analysis: ${(err as Error).message}`)
    }
  }

  // Auto-detectar tipo (función definida arriba junto con PASO 1)
  const championType = enrichedData?.champion_type || detectType(mergedRole, mergedHeadline)

  // Merge linkedin_data (sin PDL)
  const mergedLinkedinData = {
    ...(champion.linkedin_data || {}),
    ...(enrichedData?.linkedin_data || {}),
  }
  // Limpiar datos PDL legacy si existían
  delete mergedLinkedinData.pdl_person
  delete mergedLinkedinData.pdl_company

  // =============================
  // PASO 3: Brief de prospección
  // =============================
  let aiProfileSummary: string | null = null
  try {
    // Obtener clientes del champion
    const { data: clients } = await supabase
      .from("champion_clients")
      .select("*")
      .eq("champion_id", champion_id)

    const clientsInfo = clients?.length
      ? `Clientes/Marcas que atiende: ${clients.map(c =>
          c.matched_entidad
            ? `${c.matched_entidad} (${c.matched_industria} / ${c.matched_sector})`
            : c.client_name
        ).join(", ")}`
      : "No se conocen clientes"

    const experiencesList = (enrichedData?.experiences || champion.experiences)?.slice(0, 5)?.map((e: any) =>
      `- ${e.title || "Sin cargo"} en ${e.company || "Sin empresa"} (${e.starts_at || "?"} - ${e.ends_at || "Actual"})`
    ).join("\n") || "No disponible"

    // Obtener datos de la empresa si existe
    let companyInfo = "No hay datos de la empresa"
    if (companyId) {
      const { data: companyData } = await supabase
        .from("companies")
        .select("industry, sector, size, description, pain_points, sales_angle")
        .eq("id", companyId)
        .single()
      if (companyData) {
        companyInfo = `Industria: ${companyData.industry || "?"} / Sector: ${companyData.sector || "?"} / Tamaño: ${companyData.size || "?"} / Descripción: ${companyData.description || "Sin descripción"}`
      }
    }

    // Obtener redes sociales
    const socialProfiles = champion.social_profiles || {}
    const socialInfo = Object.entries(socialProfiles)
      .map(([platform, data]: [string, any]) => `${platform}: ${data.url || data.handle || "sí"}`)
      .join(", ") || "No se encontraron redes sociales"

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: `Sos Gastón, un asistente de prospección comercial de Seenka (empresa de media intelligence de Argentina). Generá un brief de prospección accionable sobre esta persona.

DATOS DE LA PERSONA:
- Nombre: ${enrichedData?.name || champion.name}
- Cargo actual: ${mergedRole || "Desconocido"}
- Headline LinkedIn: ${mergedHeadline || "No disponible"}
- Empresa actual: ${mergedCompany || "Desconocida"}
- País: ${mergedCountry || "Desconocido"}
- Tipo de perfil: ${championType}
- ${clientsInfo}

EXPERIENCIA LABORAL:
${experiencesList}

EMPRESA:
${companyInfo}

REDES SOCIALES:
${socialInfo}

INSTRUCCIONES:
- Escribí un brief de prospección en español argentino, 4-6 oraciones
- Estructura: (1) Quién es y qué hace, (2) Trayectoria relevante, (3) Presencia en redes, (4) Ángulo de entrada sugerido para Seenka
- Sé concreto y accionable: mencioná datos específicos que ayuden a personalizar el primer contacto
- Si maneja clientes/marcas, mencioná cuáles y cómo se conectan con lo que Seenka ofrece
- Si tiene redes sociales activas, sugerí cómo usar esa info para romper el hielo
- Solo usá información real de los datos de arriba, no inventés
- Texto corrido, sin bullets, sin títulos, sin markdown`,
    })

    aiProfileSummary = text
  } catch (err) {
    errors.push(`Brief de prospección: ${(err as Error).message}`)
  }

  // =============================
  // GUARDAR TODO
  // =============================
  const updateData: Record<string, any> = {
    enrichment_status: errors.length > 0 && !enrichedData ? "error" : "complete",
    enrichment_error: errors.length > 0 ? errors.join(" | ") : null,
    linkedin_data: mergedLinkedinData,
    champion_type: championType,
    company_id: companyId,
  }

  // Mapear campos de Apollo
  if (enrichedData?.name) updateData.name = enrichedData.name
  if (mergedRole) updateData.role = mergedRole
  if (mergedCompany) updateData.company = mergedCompany
  if (mergedHeadline) updateData.headline = mergedHeadline
  if (mergedCountry) updateData.country = mergedCountry
  if (aiProfileSummary) updateData.ai_profile_summary = aiProfileSummary
  if (enrichedData?.photo_url) updateData.photo_url = enrichedData.photo_url
  if (enrichedData?.experiences) updateData.experiences = enrichedData.experiences
  if (enrichedData?.educations) updateData.educations = enrichedData.educations

  const { error: updateError } = await supabase
    .from("champions")
    .update(updateData)
    .eq("id", champion_id)

  if (updateError) {
    await supabase
      .from("champions")
      .update({ enrichment_status: "error", enrichment_error: updateError.message })
      .eq("id", champion_id)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    status: updateData.enrichment_status,
    errors: errors.length > 0 ? errors : undefined,
  })
}
