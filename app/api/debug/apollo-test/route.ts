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
  const pdlPerson = champ.linkedin_data?.pdl_person || null
  const pdlCompany = champ.linkedin_data?.pdl_company || null

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
    pdl_person: pdlPerson || "no PDL person data",
    pdl_company: pdlCompany || "no PDL company data",
    linkedin_data_top_keys: champ.linkedin_data ? Object.keys(champ.linkedin_data) : "no linkedin_data",
  })
}
