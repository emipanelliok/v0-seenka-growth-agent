import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Temporary debug endpoint to see Apollo data structure
// DELETE THIS AFTER TESTING

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const searchParams = request.nextUrl.searchParams
  const name = searchParams.get("name") || "Pablo"

  // Get champion's linkedin_data
  const { data: champions } = await supabase
    .from("champions")
    .select("id, name, email, role, company, country, headline, linkedin_url, linkedin_data, social_profiles, phone, enrichment_status")
    .ilike("name", `%${name}%`)
    .limit(3)

  if (!champions || champions.length === 0) {
    return NextResponse.json({ error: "No champion found matching: " + name })
  }

  // For the first match, extract the Apollo person data structure
  const champ = champions[0]
  const apolloPerson = champ.linkedin_data?.person || null

  return NextResponse.json({
    champion_basic: {
      id: champ.id,
      name: champ.name,
      email: champ.email,
      role: champ.role,
      company: champ.company,
      country: champ.country,
      headline: champ.headline,
      linkedin_url: champ.linkedin_url,
      phone: champ.phone,
      social_profiles: champ.social_profiles,
      enrichment_status: champ.enrichment_status,
    },
    apollo_person_keys: apolloPerson ? Object.keys(apolloPerson) : "no apollo data",
    apollo_person_sample: apolloPerson ? {
      first_name: apolloPerson.first_name,
      last_name: apolloPerson.last_name,
      title: apolloPerson.title,
      headline: apolloPerson.headline,
      email: apolloPerson.email,
      photo_url: apolloPerson.photo_url,
      city: apolloPerson.city,
      state: apolloPerson.state,
      country: apolloPerson.country,
      organization_name: apolloPerson.organization_name,
      departments: apolloPerson.departments,
      subdepartments: apolloPerson.subdepartments,
      seniority: apolloPerson.seniority,
      functions: apolloPerson.functions,
      phone_numbers: apolloPerson.phone_numbers,
      personal_emails: apolloPerson.personal_emails,
      twitter_url: apolloPerson.twitter_url,
      facebook_url: apolloPerson.facebook_url,
      github_url: apolloPerson.github_url,
      linkedin_url: apolloPerson.linkedin_url,
      employment_history_count: apolloPerson.employment_history?.length || 0,
      employment_history: apolloPerson.employment_history?.slice(0, 5),
      organization: apolloPerson.organization ? {
        name: apolloPerson.organization.name,
        website_url: apolloPerson.organization.website_url,
        industry: apolloPerson.organization.industry,
        estimated_num_employees: apolloPerson.organization.estimated_num_employees,
        short_description: apolloPerson.organization.short_description,
        founded_year: apolloPerson.organization.founded_year,
        logo_url: apolloPerson.organization.logo_url,
      } : null,
    } : "no apollo data",
    linkedin_data_top_keys: champ.linkedin_data ? Object.keys(champ.linkedin_data) : "no linkedin_data",
    // Show piloterr data if present (old source)
    piloterr_data: champ.linkedin_data?._source ? {
      full_name: champ.linkedin_data.full_name,
      headline: champ.linkedin_data.headline,
      summary: champ.linkedin_data.summary,
      photo_url: champ.linkedin_data.photo_url,
      follower_count: champ.linkedin_data.follower_count,
      connection_count: champ.linkedin_data.connection_count,
      languages: champ.linkedin_data.languages,
      experiences_count: champ.linkedin_data.experiences?.length || 0,
      experiences: champ.linkedin_data.experiences?.slice(0, 5),
      educations: champ.linkedin_data.educations,
      people_also_viewed: champ.linkedin_data.people_also_viewed?.slice(0, 3),
      articles: champ.linkedin_data.articles?.slice(0, 3),
    } : "no piloterr data",
  })
}

// Also support POST to run Apollo enrichment live
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { linkedin_url } = await request.json()
  if (!linkedin_url) return NextResponse.json({ error: "linkedin_url required" }, { status: 400 })

  const apolloKey = process.env.APOLLO_API_KEY
  if (!apolloKey) return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 })

  // Clean URL
  let cleanUrl = linkedin_url
  try { cleanUrl = decodeURIComponent(linkedin_url).replace(/\/$/, "").split("?")[0] } catch {}

  const response = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apolloKey,
    },
    body: JSON.stringify({ linkedin_url: cleanUrl }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: `Apollo error: ${response.status}`, body: await response.text() })
  }

  const result = await response.json()
  const p = result?.person

  return NextResponse.json({
    apollo_raw_keys: p ? Object.keys(p) : "no person",
    apollo_person: p ? {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      name: p.name,
      title: p.title,
      headline: p.headline,
      email: p.email,
      email_status: p.email_status,
      photo_url: p.photo_url,
      city: p.city,
      state: p.state,
      country: p.country,
      linkedin_url: p.linkedin_url,
      twitter_url: p.twitter_url,
      facebook_url: p.facebook_url,
      github_url: p.github_url,
      phone_numbers: p.phone_numbers,
      personal_emails: p.personal_emails,
      departments: p.departments,
      subdepartments: p.subdepartments,
      seniority: p.seniority,
      functions: p.functions,
      intent_strength: p.intent_strength,
      organization_name: p.organization_name || p.organization?.name,
      organization: p.organization ? {
        id: p.organization.id,
        name: p.organization.name,
        website_url: p.organization.website_url,
        linkedin_url: p.organization.linkedin_url,
        twitter_url: p.organization.twitter_url,
        facebook_url: p.organization.facebook_url,
        industry: p.organization.industry,
        estimated_num_employees: p.organization.estimated_num_employees,
        short_description: p.organization.short_description,
        long_description: p.organization.long_description,
        founded_year: p.organization.founded_year,
        logo_url: p.organization.logo_url,
        primary_domain: p.organization.primary_domain,
        keywords: p.organization.keywords,
        annual_revenue: p.organization.annual_revenue,
        total_funding: p.organization.total_funding,
        raw_address: p.organization.raw_address,
      } : null,
      employment_history: p.employment_history?.slice(0, 10),
    } : "no person found",
  })
}
