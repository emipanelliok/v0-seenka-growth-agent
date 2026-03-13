import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSeenkaInsightForBrand, getSeenkaDataForSector } from "@/lib/seenka-mcp"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { brand_names, sector, country } = await req.json()

  const apiKey = process.env.SEENKA_MCP_API_KEY
  if (!apiKey) return NextResponse.json({ error: "SEENKA_MCP_API_KEY not set" }, { status: 500 })

  try {
    const parts: string[] = []

    // Fetch insight for each brand (max 3 to save credits)
    if (brand_names?.length > 0) {
      const brandsToQuery = (brand_names as string[]).slice(0, 3)
      const results = await Promise.all(
        brandsToQuery.map((brand: string) => getSeenkaInsightForBrand(brand, country))
      )
      results.forEach((result) => {
        if (result) parts.push(result.text)
      })
    }

    // Fallback: sector-level data
    if (parts.length === 0 && sector) {
      const sectorText = await getSeenkaDataForSector(sector, country)
      if (sectorText) parts.push(sectorText)
    }

    if (parts.length === 0) {
      return NextResponse.json({ error: "No se encontraron datos en Seenka para estas marcas." }, { status: 404 })
    }

    return NextResponse.json({ success: true, text: parts.join("\n\n") })
  } catch (err) {
    console.error("[Seenka MCP API] Error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
