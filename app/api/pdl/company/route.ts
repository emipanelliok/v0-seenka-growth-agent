import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { company_name, website, linkedin_url } = await request.json()

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

    // Prefer website or LinkedIn, fallback to name
    if (website) {
      params.append("website", website)
    } else if (linkedin_url) {
      params.append("profile", linkedin_url)
    } else if (company_name) {
      params.append("name", company_name)
    } else {
      return NextResponse.json({ error: "company_name, website, or linkedin_url required" }, { status: 400 })
    }

    const response = await fetch(
      `https://api.peopledatalabs.com/v5/company/enrich?${params.toString()}`,
      { method: "GET" }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Company not found in PDL", found: false }, { status: 404 })
      }
      const errorText = await response.text()
      console.error("PDL Company API error:", response.status, errorText)
      return NextResponse.json({ error: "PDL API error" }, { status: response.status })
    }

    const result = await response.json()
    const company = result.data || result

    // Extract useful fields
    const enrichedCompany = {
      found: true,
      name: company.name,
      display_name: company.display_name,
      industry: company.industry,
      sub_industry: company.sub_industry,
      sector: company.sector,
      tags: company.tags || [],
      size: company.size,
      employee_count: company.employee_count,
      employee_count_range: company.employee_count_range,
      estimated_revenue: company.estimated_revenue,
      founded: company.founded,
      website: company.website,
      linkedin_url: company.linkedin_url,
      twitter_url: company.twitter_url,
      facebook_url: company.facebook_url,
      location: company.location ? {
        name: company.location.name,
        country: company.location.country,
        region: company.location.region,
        locality: company.location.locality,
      } : null,
      description: company.summary,
      headline: company.headline,
      type: company.type,
      ticker: company.ticker,
      affiliated_profiles: company.affiliated_profiles || [],
      // Naics codes give industry classification
      naics: company.naics ? company.naics.map((n: any) => ({
        code: n.naics_code,
        description: n.naics_description,
        sector: n.sector,
      })) : [],
      // SIC codes
      sic: company.sic ? company.sic.map((s: any) => ({
        code: s.sic_code,
        description: s.sic_description,
      })) : [],
      likelihood: result.likelihood,
    }

    return NextResponse.json(enrichedCompany)
  } catch (error) {
    console.error("PDL Company enrichment error:", error)
    return NextResponse.json({ error: "Failed to enrich company" }, { status: 500 })
  }
}
