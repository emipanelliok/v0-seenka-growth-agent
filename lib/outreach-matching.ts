import type { Champion, Efemeride, EfemerideIndustryData, OutreachStage } from "./types"

export interface ChampionClient {
  id: string
  champion_id: string
  client_name: string
  matched_entidad?: string | null
  matched_sector?: string | null
  matched_industria?: string | null
}

export interface MatchResult {
  matches: boolean
  matchedData: string | null
}

export function getStageFromInteractions(
  championId: string,
  interactions: Array<{ champion_id: string; channel: string; created_at: string }>
): OutreachStage {
  const champInteractions = interactions.filter((i) => i.champion_id === championId)
  if (champInteractions.length === 0) return "cold"
  if (champInteractions.length >= 3) return "reengagement"
  return "warm"
}

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\/&]/g, " ").replace(/\s+/g, " ").trim()
}

export function getIndustryKeywords(industry: string): string[] {
  const base = normalizeForMatch(industry)
  const map: Array<{ keys: string[]; keywords: string[] }> = [
    { keys: ["retail"], keywords: ["retail", "ecommerce", "e-commerce", "tienda", "store", "shop", "comercio"] },
    { keys: ["tecnolog", "tech"], keywords: ["tech", "tecnolog", "software", "hardware", "digital", "it "] },
    { keys: ["moda", "indumentaria"], keywords: ["moda", "fashion", "indumentaria", "ropa", "apparel", "textil"] },
    { keys: ["consumo masivo"], keywords: ["consumo masivo", "fmcg", "cpg", "consumer goods", "aliment"] },
    { keys: ["turismo", "hotel"], keywords: ["turismo", "hotel", "travel", "viaje", "tourism", "hospitality"] },
    { keys: ["automotriz", "auto", "automóvil", "automovil", "vehiculo", "vehicul", "fábricas automotrices", "fabricas automotrices"], keywords: ["auto", "automóvil", "automovil", "automotriz", "car", "motor", "vehicul", "automotive", "fábricas automotrices"] },
    { keys: ["entretenimiento", "entertainment"], keywords: ["entertainment", "entretenimiento", "media", "streaming", "gaming"] },
    { keys: ["alimento", "bebida", "food"], keywords: ["alimento", "bebida", "food", "beverage", "gastro"] },
    { keys: ["farma", "salud", "pharma"], keywords: ["pharma", "farma", "salud", "health", "medical", "laboratorio"] },
    { keys: ["telecom", "telecomunic"], keywords: ["telecom", "telco", "celular", "mobile", "telefon"] },
    { keys: ["educaci", "education"], keywords: ["educación", "education", "universidad", "school", "capacitación"] },
    { keys: ["banca", "finanz", "financ"], keywords: ["banco", "bank", "finanz", "financ", "seguro", "insurance", "fintech", "credito", "tarjeta", "banca"] },
    { keys: ["oil", "gas", "petrol", "energy", "energía"], keywords: ["oil", "gas", "petrol", "energy", "energía", "combustible", "shell", "ypf"] },
    { keys: ["real estate", "inmobiliar"], keywords: ["inmobiliar", "real estate", "propiedad", "construc"] },
  ]
  for (const entry of map) {
    if (entry.keys.some((k) => base.includes(k))) return entry.keywords
  }
  return [base]
}

export function matchChampionToEfemeride(
  champion: Champion,
  clients: ChampionClient[],
  efemeride: Efemeride,
  industryData: EfemerideIndustryData[]
): MatchResult {
  // Check country match — si no tiene país, no lo excluimos
  const champCountry = champion.country
  if (champCountry) {
    const countryNameToCode: Record<string, string> = {
      argentina: "AR", "arg": "AR",
      méxico: "MX", mexico: "MX", "mex": "MX",
      colombia: "CO", "col": "CO",
      chile: "CL",
      perú: "PE", peru: "PE",
      brasil: "BR", brazil: "BR",
      "estados unidos": "US", "united states": "US",
    }
    // Buscar si alguna keyword de país está contenida en el string del champion
    const champCountryLower = champCountry.toLowerCase()
    let resolvedCode: string | null = null
    for (const [key, code] of Object.entries(countryNameToCode)) {
      if (champCountryLower.includes(key)) {
        resolvedCode = code
        break
      }
    }
    // Fallback: si no matcheó por nombre, intentar como código directo (ej: "AR")
    if (!resolvedCode) {
      resolvedCode = champCountry.trim().toUpperCase().slice(0, 2)
    }
    if (!efemeride.countries.includes(resolvedCode)) {
      return { matches: false, matchedData: null }
    }
  }

  // Check industry match - si la efemeride tiene industrias definidas, el champion debe matchear
  if (efemeride.industries && efemeride.industries.length > 0) {
    const efemerideIndustryKeywords: string[] = []
    for (const ind of efemeride.industries) {
      efemerideIndustryKeywords.push(...getIndustryKeywords(ind))
    }

    // Buscar match en champion_type o en los clientes
    let industryMatched = false
    let matchedData: string | null = null

    // Check champion_type
    if (champion.champion_type) {
      const champType = normalizeForMatch(champion.champion_type)
      if (efemerideIndustryKeywords.some(kw => champType.includes(kw) || kw.includes(champType))) {
        industryMatched = true
      }
    }

    // Check client industries
    if (!industryMatched && clients.length > 0) {
      for (const client of clients) {
        const clientIndustry = normalizeForMatch(
          client.matched_industria || client.matched_sector || ""
        )
        if (clientIndustry && efemerideIndustryKeywords.some(kw => 
          clientIndustry.includes(kw) || kw.includes(clientIndustry)
        )) {
          industryMatched = true
          // Buscar data de industria si existe
          const matchingIndustryData = industryData.find(d => 
            normalizeForMatch(d.industry).includes(clientIndustry) ||
            clientIndustry.includes(normalizeForMatch(d.industry))
          )
          if (matchingIndustryData) {
            matchedData = matchingIndustryData.seenka_data
          }
          break
        }
      }
    }

    if (!industryMatched) {
      return { matches: false, matchedData: null }
    }

    return { matches: true, matchedData: matchedData || efemeride.seenka_data_hint || null }
  }

  // Si la efemeride no tiene industrias definidas, solo matchea por país
  return { matches: true, matchedData: efemeride.seenka_data_hint || null }
}

/**
 * Given all champions, clients, interactions and an efemeride,
 * returns the list of matched candidates with stage and channel info.
 */
export function buildOutreachCandidates(
  champions: Champion[],
  allClients: ChampionClient[],
  interactions: Array<{ champion_id: string; channel: string; created_at: string }>,
  efemeride: Efemeride,
  industryData: EfemerideIndustryData[]
) {
  const candidates: Array<{
    champion: Champion
    clients: ChampionClient[]
    stage: OutreachStage
    matchedIndustryData: string | null
    channel: "linkedin" | "email"
  }> = []

  for (const champ of champions) {
    const champClients = allClients.filter((c) => c.champion_id === champ.id)
    const { matches, matchedData } = matchChampionToEfemeride(
      champ, champClients, efemeride, industryData
    )
    if (!matches) continue

    // Auto-assign channel: email if has email, linkedin if has linkedin_url
    const channel = champ.email ? "email" : "linkedin"

    candidates.push({
      champion: champ,
      clients: champClients,
      stage: getStageFromInteractions(champ.id, interactions),
      matchedIndustryData: matchedData,
      channel,
    })
  }

  return candidates
}
