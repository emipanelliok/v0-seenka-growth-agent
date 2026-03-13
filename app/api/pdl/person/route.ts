import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { linkedin_url, name, company } = await request.json()

    const apiKey = process.env.PDL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "PDL_API_KEY not configured" }, { status: 500 })
    }

    // Build query params
    const params = new URLSearchParams({
      api_key: apiKey,
      titlecase: "true",
      pretty: "true",
      min_likelihood: "3",
    })

    // Prefer LinkedIn URL, fallback to name+company
    if (linkedin_url) {
      const cleanUrl = linkedin_url.replace(/\/$/, "").split("?")[0]
      params.append("profile", cleanUrl)
    } else if (name) {
      params.append("name", name)
      if (company) params.append("company", company)
    } else {
      return NextResponse.json({ error: "linkedin_url or name required" }, { status: 400 })
    }

    const response = await fetch(
      `https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`,
      { method: "GET" }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Person not found in PDL", found: false }, { status: 404 })
      }
      const errorText = await response.text()
      console.error("PDL Person API error:", response.status, errorText)
      return NextResponse.json({ error: "PDL API error" }, { status: response.status })
    }

    const result = await response.json()
    const person = result.data || result

    // Extract useful fields
    const enrichedPerson = {
      found: true,
      full_name: person.full_name,
      job_title: person.job_title,
      job_title_role: person.job_title_role,
      job_title_sub_role: person.job_title_sub_role,
      job_title_levels: person.job_title_levels,
      job_company_name: person.job_company_name,
      job_company_industry: person.job_company_industry,
      job_company_size: person.job_company_size,
      job_company_website: person.job_company_website,
      job_company_linkedin_url: person.job_company_linkedin_url,
      industry: person.industry,
      skills: person.skills || [],
      interests: person.interests || [],
      experience: (person.experience || []).map((exp: any) => ({
        company_name: exp.company?.name,
        title: exp.title?.name,
        start_date: exp.start_date,
        end_date: exp.end_date,
        is_primary: exp.is_primary,
        summary: exp.summary,
      })),
      education: (person.education || []).map((edu: any) => ({
        school_name: edu.school?.name,
        degree: edu.degrees?.join(", "),
        major: edu.majors?.join(", "),
      })),
      location: person.location_name,
      linkedin_url: person.linkedin_url,
      twitter_url: person.twitter_url,
      facebook_url: person.facebook_url,
      github_url: person.github_url,
      summary: person.summary,
      sex: person.sex,
      likelihood: result.likelihood,
    }

    return NextResponse.json(enrichedPerson)
  } catch (error) {
    console.error("PDL Person enrichment error:", error)
    return NextResponse.json({ error: "Failed to enrich person" }, { status: 500 })
  }
}
