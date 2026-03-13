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
  let pdlPersonData: any = null
  let pdlCompanyData: any = null

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
  // PASO 1: Piloterr (LinkedIn scraping) - llamada directa
  // =============================
  try {
    const piloterrKey = process.env.PILOTERR_API_KEY
    if (piloterrKey && rawLinkedinUrl) {
      let piloterrResponse: Response | null = null
      try {
        piloterrResponse = await fetch(
          `https://piloterr.com/api/v2/linkedin/profile?query=${encodeURIComponent(rawLinkedinUrl)}`,
          { headers: { "x-api-key": piloterrKey, "Content-Type": "application/json" } }
        )
      } catch (fetchErr) {
        errors.push(`Piloterr fetch: ${(fetchErr as Error).message}`)
      }
      if (piloterrResponse?.ok) {
        const rawData = await piloterrResponse.json()
        if (rawData && !rawData.error) {
          const detectType = (role: string, headline: string) => {
            const text = `${role} ${headline}`.toLowerCase()
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

          const role = rawData.sub_title || rawData.position_groups?.[0]?.profile_positions?.[0]?.title || ""
          const company = rawData.position_groups?.[0]?.company?.name || rawData.position_groups?.[0]?.profile_positions?.[0]?.company || ""
          const headline = rawData.headline || rawData.sub_title || ""

          enrichedData = {
            name: rawData.first_name && rawData.last_name ? `${rawData.first_name} ${rawData.last_name}` : rawData.full_name || null,
            role: role,
            company: company,
            country: rawData.country || rawData.location || null,
            headline: headline,
            summary: rawData.summary || null,
            photo_url: rawData.profile_pic_url || null,
            website_url: rawData.websites?.length > 0 ? rawData.websites[0] : null,
            follower_count: rawData.follower_count || null,
            connection_count: rawData.connection_count || null,
            languages: rawData.languages?.map((l: any) => typeof l === "string" ? l : l.name) || null,
            experiences: rawData.position_groups?.flatMap((g: any) =>
              g.profile_positions?.map((p: any) => ({
                title: p.title || "",
                company: g.company?.name || p.company || "",
                starts_at: p.date?.start ? `${p.date.start.month || ""}/${p.date.start.year || ""}` : null,
                ends_at: p.date?.end ? `${p.date.end.month || ""}/${p.date.end.year || ""}` : "Actual",
              })) || []
            ) || null,
            educations: rawData.education?.map((e: any) => ({
              school: e.school_name || e.school || "",
              degree: e.degree || "",
              field: e.field_of_study || "",
            })) || null,
            similar_profiles: rawData.people_also_viewed?.slice(0, 5)?.map((p: any) => ({
              name: p.name || "",
              role: p.title || "",
              url: p.url || "",
            })) || null,
            linkedin_data: rawData,
            champion_type: detectType(role, headline),
          }
        } else {
          errors.push("Piloterr: perfil no encontrado o error en respuesta")
        }
      } else if (piloterrResponse && !piloterrResponse.ok) {
        errors.push(`Piloterr: error ${piloterrResponse.status}`)
      }
    }
  } catch (err) {
    errors.push(`Piloterr: ${(err as Error).message}`)
  }

  // =============================
  // PASO 2: PDL Person Enrichment - llamada directa
  // =============================
  try {
    const pdlApiKey = process.env.PDL_API_KEY
    if (pdlApiKey && rawLinkedinUrl) {
      const pdlParams = new URLSearchParams({
        api_key: pdlApiKey,
        profile: rawLinkedinUrl,
        min_likelihood: "3",
      })
      let pdlResponse: Response | null = null
      try {
        pdlResponse = await fetch(
          `https://api.peopledatalabs.com/v5/person/enrich?${pdlParams.toString()}`
        )
      } catch (fetchErr) {
        errors.push(`PDL Person fetch: ${(fetchErr as Error).message}`)
      }
      if (pdlResponse?.ok) {
        const pdlResult = await pdlResponse.json()
        if (pdlResult.status === 200 && pdlResult.data) {
          const d = pdlResult.data
          pdlPersonData = {
            found: true,
            full_name: d.full_name,
            job_title: d.job_title,
            job_company_name: d.job_company_name,
            job_company_website: d.job_company_website,
            job_company_linkedin_url: d.job_company_linkedin_url,
            job_company_industry: d.job_company_industry,
            job_company_size: d.job_company_size,
            job_company_employee_count: d.job_company_employee_count,
            industry: d.industry,
            skills: d.skills || [],
            interests: d.interests || [],
            location: d.location_name,
            summary: d.summary,
            twitter_url: d.twitter_url,
            github_url: d.github_url,
            facebook_url: d.facebook_url,
          }
        }
      }
    }
  } catch (err) {
    errors.push(`PDL Person: ${(err as Error).message}`)
  }

  // Merge datos
  const mergedRole = enrichedData?.role || pdlPersonData?.job_title || champion.role
  const mergedHeadline = enrichedData?.headline || champion.headline
  const mergedCompany = enrichedData?.company || pdlPersonData?.job_company_name || champion.company
  const mergedCountry = enrichedData?.country || pdlPersonData?.location || champion.country

  // =============================
  // PASO 3: PDL Company Enrichment - llamada directa
  // =============================
  if (mergedCompany) {
    try {
      const pdlApiKey = process.env.PDL_API_KEY
      if (pdlApiKey) {
        const params = new URLSearchParams({
          api_key: pdlApiKey,
          name: mergedCompany,
        })
        if (pdlPersonData?.job_company_website) params.append("website", pdlPersonData.job_company_website)
        if (pdlPersonData?.job_company_linkedin_url) params.append("profile", pdlPersonData.job_company_linkedin_url)

        let pdlCompanyResponse: Response | null = null
        try {
          pdlCompanyResponse = await fetch(
            `https://api.peopledatalabs.com/v5/company/enrich?${params.toString()}`
          )
        } catch (fetchErr) {
          errors.push(`PDL Company fetch: ${(fetchErr as Error).message}`)
        }
        if (pdlCompanyResponse?.ok) {
          const pdlCompResult = await pdlCompanyResponse.json()
          if (pdlCompResult.status === 200 && pdlCompResult.data) {
            const d = pdlCompResult.data
            pdlCompanyData = {
              found: true,
              name: d.name,
              display_name: d.display_name,
              industry: d.industry,
              sub_industry: d.sub_industry,
              size: d.size,
              employee_count: d.employee_count,
              founded: d.founded,
              type: d.type,
              description: d.summary,
              website: d.website,
              linkedin_url: d.linkedin_url,
              tags: d.tags || [],
              location: d.location?.name,
            }
          }
        }
      }
    } catch (err) {
      errors.push(`PDL Company: ${(err as Error).message}`)
    }
  }

  // =============================
  // PASO 4: Analyze Company con GPT - INLINE (no fetch interno)
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
${pdlCompanyData?.description ? `Descripción empresa: ${pdlCompanyData.description}` : ""}
${pdlCompanyData?.industry ? `Industria PDL: ${pdlCompanyData.industry}` : ""}

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

  // Auto-detectar tipo
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
  const championType = enrichedData?.champion_type || detectType(mergedRole, mergedHeadline)

  // Merge linkedin_data
  const mergedLinkedinData = {
    ...(champion.linkedin_data || {}),
    ...(enrichedData?.linkedin_data || {}),
    pdl_person: pdlPersonData || undefined,
    pdl_company: pdlCompanyData || undefined,
  }

  // =============================
  // PASO 5: Generar perfil IA - INLINE (no fetch interno)
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

    const skillsList = pdlPersonData?.skills?.slice(0, 15)?.join(", ") || "No disponible"
    const experiencesList = (enrichedData?.experiences || champion.experiences)?.slice(0, 3)?.map((e: any) =>
      `- ${e.title || "Sin cargo"} en ${e.company || "Sin empresa"} (${e.starts_at || "?"} - ${e.ends_at || "Actual"})`
    ).join("\n") || "No disponible"

    const companyInfo = pdlCompanyData?.found
      ? `Industria: ${pdlCompanyData.industry || "?"} / Tamaño: ${pdlCompanyData.size || "?"} (${pdlCompanyData.employee_count?.toLocaleString() || "?"} empleados) / Tags: ${pdlCompanyData.tags?.slice(0, 8)?.join(", ") || "Sin tags"} / Descripción: ${pdlCompanyData.description || "Sin descripción"}`
      : "No hay datos detallados de la empresa"

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: `Sos un asistente que sintetiza datos profesionales de una persona en un resumen ejecutivo factual. NO inventés datos, NO hagas recomendaciones de venta, NO saques conclusiones sobre qué venderle ni cómo abordarlo. Solo resumí lo que sabemos.

DATOS DISPONIBLES:
- Nombre: ${enrichedData?.name || pdlPersonData?.full_name || champion.name}
- Cargo actual: ${mergedRole || "Desconocido"}
- Headline LinkedIn: ${mergedHeadline || "No disponible"}
- Empresa actual: ${mergedCompany || "Desconocida"}
- País: ${mergedCountry || "Desconocido"}
- Clasificación: ${championType}
- Bio/Resumen LinkedIn: ${enrichedData?.summary || pdlPersonData?.summary || "No disponible"}
- Skills: ${skillsList}
- ${clientsInfo}

EXPERIENCIA LABORAL:
${experiencesList}

DATOS DE LA EMPRESA:
${companyInfo}

INSTRUCCIONES:
- Escribí un resumen factual de 3-5 oraciones en español argentino
- Describí quién es: cargo, empresa, industria, trayectoria relevante
- Mencioná datos concretos: skills, clientes que maneja, tamaño de empresa, industria
- Si hay datos de experiencia previa relevantes, mencioná los cargos anteriores
- Si maneja clientes/marcas, listalos
- NO recomiendes cómo venderle, NO menciones Creative Sense, NO hagas suposiciones sobre qué le interesaría
- Solo usá información que esté en los datos de arriba, no inventés nada
- Texto corrido en un párrafo, sin bullets, sin títulos`,
    })

    aiProfileSummary = text
  } catch (err) {
    errors.push(`AI Profile: ${(err as Error).message}`)
  }

  // =============================
  // GUARDAR TODO
  // =============================
  const updateData: Record<string, any> = {
    enrichment_status: errors.length > 0 && !enrichedData && !pdlPersonData ? "error" : "complete",
    enrichment_error: errors.length > 0 ? errors.join(" | ") : null,
    linkedin_data: mergedLinkedinData,
    champion_type: championType,
    company_id: companyId,
  }

  // Mapear nombre
  if (enrichedData?.name || pdlPersonData?.full_name) updateData.name = enrichedData?.name || pdlPersonData?.full_name
  if (mergedRole) updateData.role = mergedRole
  if (mergedCompany) updateData.company = mergedCompany
  if (mergedHeadline) updateData.headline = mergedHeadline
  if (enrichedData?.summary || pdlPersonData?.summary) updateData.summary = enrichedData?.summary || pdlPersonData?.summary
  if (mergedCountry) updateData.country = mergedCountry
  if (aiProfileSummary) updateData.ai_profile_summary = aiProfileSummary

  // Campos de Piloterr (preferidos)
  if (enrichedData?.photo_url) updateData.photo_url = enrichedData.photo_url
  if (enrichedData?.website_url) updateData.website_url = enrichedData.website_url
  if (enrichedData?.follower_count) updateData.follower_count = enrichedData.follower_count
  if (enrichedData?.connection_count) updateData.connection_count = enrichedData.connection_count
  if (enrichedData?.languages) updateData.languages = enrichedData.languages
  if (enrichedData?.similar_profiles) updateData.similar_profiles = enrichedData.similar_profiles

  // Experiencias: Piloterr primero, si no hay, armar desde PDL Person
  if (enrichedData?.experiences) {
    updateData.experiences = enrichedData.experiences
  } else if (pdlPersonData?.found) {
    // PDL tiene experience como array en el raw data - lo guardamos en linkedin_data
    // Pero también podemos crear experiencias del job_title + job_company actual
    const pdlExperiences = []
    if (pdlPersonData.job_title && pdlPersonData.job_company_name) {
      pdlExperiences.push({
        title: pdlPersonData.job_title,
        company: pdlPersonData.job_company_name,
        is_current: true,
        location: pdlPersonData.location,
      })
    }
    if (pdlExperiences.length > 0) {
      updateData.experiences = pdlExperiences
    }
  }

  // Educación: Piloterr primero
  if (enrichedData?.educations) {
    updateData.educations = enrichedData.educations
  }

  // Industria: Piloterr primero, si no PDL Person o PDL Company
  if (enrichedData?.industry) {
    updateData.industry = enrichedData.industry
  } else if (pdlPersonData?.industry) {
    updateData.industry = pdlPersonData.industry
  } else if (pdlCompanyData?.industry) {
    updateData.industry = pdlCompanyData.industry
  }

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
