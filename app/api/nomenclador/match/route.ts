import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { client_name } = await request.json()

  if (!client_name) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const searchTerm = client_name.toLowerCase().trim()

  // 1. Búsqueda exacta primero
  const { data: exactMatch } = await supabase
    .from("seenka_nomenclador")
    .select("id, entidad, sector, industria")
    .eq("entidad_lower", searchTerm)
    .limit(1)

  if (exactMatch && exactMatch.length > 0) {
    return NextResponse.json({
      found: true,
      match_type: "exact",
      score: 1.0,
      ...exactMatch[0],
    })
  }

  // 2. Búsqueda por contenido (entidad contiene el término o viceversa)
  const { data: containsMatch } = await supabase
    .from("seenka_nomenclador")
    .select("id, entidad, sector, industria")
    .or(`entidad_lower.ilike.%${searchTerm}%`)
    .limit(5)

  if (containsMatch && containsMatch.length > 0) {
    return NextResponse.json({
      found: true,
      match_type: "contains",
      score: 0.8,
      ...containsMatch[0],
      alternatives: containsMatch.slice(1),
    })
  }

  // 3. Búsqueda fuzzy con trigrams (similarity)
  const { data: fuzzyMatch } = await supabase
    .rpc("search_nomenclador_fuzzy", { search_term: searchTerm })

  if (fuzzyMatch && fuzzyMatch.length > 0) {
    return NextResponse.json({
      found: true,
      match_type: "fuzzy",
      score: fuzzyMatch[0].similarity,
      id: fuzzyMatch[0].id,
      entidad: fuzzyMatch[0].entidad,
      sector: fuzzyMatch[0].sector,
      industria: fuzzyMatch[0].industria,
      alternatives: fuzzyMatch.slice(1).map((m: any) => ({
        id: m.id,
        entidad: m.entidad,
        sector: m.sector,
        industria: m.industria,
      })),
    })
  }

  return NextResponse.json({ found: false })
}
