// Database types for Seenka Growth Agent

export type ChampionType = 'creative' | 'media' | 'marketing' | 'sales' | 'strategy' | 'other'
export type ChampionLevel = 'high' | 'medium' | 'low'
export type ChampionStatus = 'listening' | 'trigger_detected' | 'contacted' | 'responded' | 'opportunity' | 'paused'
export type TriggerType = 'post' | 'shared' | 'data_seenka' | 'market_context'
export type TriggerSeverity = 'high' | 'medium' | 'low'
export type InteractionChannel = 'linkedin' | 'email'
export type InteractionOutcome = 'sent' | 'responded' | 'ignored'

export interface LinkedInExperience {
  title: string
  company: string
  company_url?: string
  location?: string
  start_date?: string
  end_date?: string
  description?: string
  is_current?: boolean
}

export interface LinkedInEducation {
  school: string
  degree?: string
  field_of_study?: string
  start_date?: string
  end_date?: string
}

export interface SimilarProfile {
  name: string
  headline?: string
  url: string
  location?: string
}

export interface Company {
  id: string
  name: string
  normalized_name: string
  industry?: string | null
  sector?: string | null
  size?: string | null
  website?: string | null
  linkedin_url?: string | null
  description?: string | null
  seenka_products?: string[] | null
  pain_points?: string[] | null
  sales_angle?: string | null
  analyzed_at?: string | null
  created_at: string
}

export interface Champion {
  id: string
  user_id: string
  name: string
  linkedin_url?: string | null
  email?: string | null
  role?: string | null
  company?: string | null
  industry?: string | null
  country?: string | null
  headline?: string | null
  summary?: string | null
  photo_url?: string | null
  website_url?: string | null
  follower_count?: number | null
  connection_count?: number | null
  languages?: string[] | null
  experiences?: LinkedInExperience[] | null
  educations?: LinkedInEducation[] | null
  similar_profiles?: SimilarProfile[] | null
  linkedin_data?: Record<string, any> | null
  company_id?: string | null
  company?: Company | null
  seenka_ai_insight?: string | null
  champion_type: ChampionType
  champion_level: ChampionLevel
  status: ChampionStatus
  enrichment_status?: 'pending' | 'enriching' | 'complete' | 'error' | null
  enrichment_error?: string | null
  ai_profile_summary?: string | null
  created_at: string
}

export interface Trigger {
  id: string
  champion_id: string
  type: TriggerType
  source_text: string
  topic?: string | null
  severity: TriggerSeverity
  is_worth_contacting: boolean
  recommended_products?: string[] | null
  product_reasoning?: string | null
  mentioned_people?: Array<{ name: string; role?: string; company?: string }> | null
  // Shared post fields
  champion_comment?: string | null
  original_author_name?: string | null
  original_author_linkedin?: string | null
  original_author_role?: string | null
  original_content?: string | null
  mentions_seenka?: boolean | null
  created_at: string
}

export interface Interaction {
  id: string
  champion_id: string
  trigger_id?: string | null
  channel: InteractionChannel
  message: string
  insight?: string | null
  sent_at?: string | null
  response?: string | null
  outcome: InteractionOutcome
  created_at: string
}

// Extended types with relationships
export interface ChampionWithTriggers extends Champion {
  triggers?: Trigger[]
}

export interface ChampionWithInteractions extends Champion {
  interactions?: Interaction[]
}

export interface TriggerWithChampion extends Trigger {
  champion?: Champion
}

export interface InteractionWithDetails extends Interaction {
  champion?: Champion
  trigger?: Trigger
}

// Form types for creating/updating
export interface CreateChampionInput {
  name: string
  linkedin_url?: string
  role?: string
  company?: string
  industry?: string
  country?: string
  champion_level?: ChampionLevel
}

export interface CreateTriggerInput {
  champion_id: string
  type: TriggerType
  source_text: string
  topic?: string
  severity?: TriggerSeverity
  is_worth_contacting?: boolean
}

export interface CreateInteractionInput {
  champion_id: string
  trigger_id?: string
  channel: InteractionChannel
  message: string
  insight?: string
}



// Status labels for UI
export const STATUS_LABELS: Record<ChampionStatus, string> = {
  listening: 'Escuchando',
  trigger_detected: 'Trigger Detectado',
  contacted: 'Contactado',
  responded: 'Respondido',
  opportunity: 'Oportunidad',
  paused: 'Pausado'
}

export const LEVEL_LABELS: Record<ChampionLevel, string> = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo'
}

export const CHAMPION_TYPE_LABELS: Record<ChampionType, string> = {
  creative: 'Creativo',
  media: 'Medios',
  marketing: 'Marketing',
  sales: 'Ventas',
  strategy: 'Estrategia',
  other: 'Otro'
}

// Keywords para auto-detectar el tipo de champion desde su cargo/headline
export const CHAMPION_TYPE_KEYWORDS: Record<ChampionType, string[]> = {
  creative: [
    'creative director', 'director creativo', 'directora creativa', 'head of creative',
    'director de arte', 'art director', 'copywriter', 'redactor', 'planner',
    'strategic planner', 'planificador estratégico', 'diseñador', 'designer',
    'brand manager creative', 'creative lead', 'chief creative', 'cco',
    'director general creativo', 'dgc', 'contenido', 'content creator'
  ],
  media: [
    'media director', 'director de medios', 'media planner', 'media buyer',
    'planificador de medios', 'head of media', 'media manager',
    'compra de medios', 'programmatic', 'trading desk', 'audiencias',
    'head of digital media', 'paid media', 'performance'
  ],
  marketing: [
    'marketing manager', 'gerente de marketing', 'head of marketing', 'cmo',
    'brand manager', 'product manager', 'growth', 'demand generation',
    'digital marketing', 'marketing digital', 'marketing director'
  ],
  sales: [
    'sales director', 'director comercial', 'head of sales', 'account executive',
    'business development', 'ejecutivo de cuentas', 'ventas', 'revenue',
    'key account', 'new business'
  ],
  strategy: [
    'strategy director', 'director de estrategia', 'head of strategy',
    'brand strategy', 'planner estratégico', 'insights', 'research',
    'investigación', 'consumer insight', 'data analyst', 'analytics'
  ],
  other: []
}

// Configuración de prompts de Seenka AI por tipo de champion
export const CHAMPION_TYPE_SEENKA_PROMPTS: Record<ChampionType, (params: { industry: string; sector: string; company: string }) => string> = {
  creative: ({ industry, sector, company }) =>
    `Hola, necesito información creativa/publicitaria del sector "${sector}" en la industria "${industry}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué campañas o piezas publicitarias destacadas tenés de la agencia/empresa "${company}" o sus competidores?

Me interesa saber:
1. Campañas destacadas recientes del sector
2. Tendencias creativas que se están viendo
3. Formatos que más se están usando (spots largos, cortos, bumpers)
4. Competidores creativos más activos
5. Algo innovador o diferente que se haya hecho

Por favor dame 5 puntos con datos concretos y ejemplos específicos. Respuesta corta y directa.`,

  media: ({ industry, sector, company }) =>
    `Hola, necesito información de inversión y medios del sector "${sector}" en la industria "${industry}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué datos tenés de la empresa "${company}" y sus competidores?

¿Qué datos relevantes podemos encontrar en segundos de aire o % de inversión?

Por favor dame 5 puntos con números, respuesta corta y datos concretos. (Cuando uses inversión usá % no montos)`,

  marketing: ({ industry, sector, company }) =>
    `Hola, necesito información de marketing y presencia de marca del sector "${sector}" en la industria "${industry}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué datos tenés de la empresa "${company}" y sus competidores en cuanto a:
1. Presencia publicitaria en medios (share of voice)
2. Estrategias de comunicación que están usando
3. Segmentos o audiencias a las que apuntan
4. Campañas más visibles del sector
5. Oportunidades o huecos que se ven en el mercado

Por favor dame 5 puntos con datos concretos. Respuesta corta y directa.`,

  sales: ({ industry, sector, company }) =>
    `Hola, necesito información comercial del sector "${sector}" en la industria "${industry}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué datos tenés de la empresa "${company}" y sus competidores?

¿Qué datos relevantes podemos encontrar en segundos de aire o % de inversión? ¿Quiénes son los mayores anunciantes?

Por favor dame 5 puntos con números, respuesta corta y datos concretos. (Cuando uses inversión usá % no montos)`,

  strategy: ({ industry, sector, company }) =>
    `Hola, necesito insights estratégicos del sector "${sector}" en la industria "${industry}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué datos tenés de la empresa "${company}" y sus competidores?

Me interesa:
1. Tendencias de la categoría en medios
2. Cambios en el mix de medios del sector
3. Movimientos estratégicos de los principales players
4. Datos de inversión comparativa (% no montos)
5. Oportunidades o insights accionables

Por favor dame 5 puntos con datos concretos. Respuesta corta y directa.`,

  other: ({ industry, sector, company }) =>
    `Hola, necesito información de la industria "${industry}", específicamente del sector "${sector}" en los últimos 30 días en Argentina en TV Aire y TV Paga.

¿Qué datos tenés de la empresa "${company}" y sus competidores?

¿Qué datos relevantes podemos encontrar en segundos de aire o % de inversión?

Por favor dame 5 puntos con números, respuesta corta y datos concretos. (Cuando uses inversión usá % no montos)`
}

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  post: 'Post LinkedIn',
  shared: 'Post Compartido',
  data_seenka: 'Dato Seenka',
  market_context: 'Contexto de Mercado'
}

export const SEVERITY_LABELS: Record<TriggerSeverity, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja'
}

export const CHANNEL_LABELS: Record<InteractionChannel, string> = {
  linkedin: 'LinkedIn',
  email: 'Email'
}

// Seenka Products
export type SeenkaProduct = 'content_insight' | 'ad_insight' | 'creative_sense' | 'adsales_radar'

export const SEENKA_PRODUCTS: Record<SeenkaProduct, { name: string; description: string; useCases: string[] }> = {
  content_insight: {
    name: 'Content Insight',
    description: 'Monitoreo de noticias y redes sociales para potenciar campañas y estrategias',
    useCases: ['Necesita entender percepción de marca', 'Quiere monitorear competencia en medios', 'Busca insights de audiencia']
  },
  ad_insight: {
    name: 'Ad Insight',
    description: 'Monitoreo de publicidad cross-media de marcas y competencia',
    useCases: ['Quiere analizar inversión publicitaria', 'Necesita benchmark de competencia', 'Busca optimizar mix de medios']
  },
  creative_sense: {
    name: 'Creative Sense',
    description: 'Biblioteca de publicidades con IA para inspirar ideas creativas',
    useCases: ['Busca inspiración creativa', 'Quiere analizar tendencias publicitarias', 'Necesita referencias de campañas']
  },
  adsales_radar: {
    name: 'AdSales Radar',
    description: 'Inteligencia comercial para identificar quién invierte, dónde y cuánto',
    useCases: ['Equipo comercial de medios', 'Necesita identificar anunciantes potenciales', 'Quiere acelerar prospección']
  }
}

// Efemerides
export interface Efemeride {
  id: string
  user_id: string
  name: string
  description?: string | null
  countries: string[]
  industries: string[]
  event_date: string
  reminder_days_before: number
  seenka_data_hint?: string | null
  manual_data?: string | null
  is_active: boolean
  created_at: string
}

export const EFEMERIDE_COUNTRIES = [
  { value: 'AR', label: 'Argentina' },
  { value: 'MX', label: 'México' },
  { value: 'CO', label: 'Colombia' },
  { value: 'CL', label: 'Chile' },
  { value: 'PE', label: 'Perú' },
  { value: 'BR', label: 'Brasil' },
  { value: 'US', label: 'Estados Unidos' },
] as const

export const EFEMERIDE_COUNTRY_LABELS: Record<string, string> = {
  AR: 'Argentina',
  MX: 'México',
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Perú',
  BR: 'Brasil',
  US: 'Estados Unidos',
}

export interface EfemerideIndustryData {
  id: string
  efemeride_id: string
  industry: string
  seenka_data: string
  created_at: string
}

export type OutreachChannel = 'linkedin' | 'email' | 'whatsapp'
export type OutreachStage = 'cold' | 'warm' | 'reengagement'

export interface OutreachCandidate {
  champion: Champion
  clients: Array<{ client_name: string; matched_sector?: string; matched_industria?: string }>
  relevance: 'alta' | 'media' | 'baja'
  relevance_reason: string
  matched_industry_data?: string | null
}

// Enhanced AI Evaluation types
export interface TriggerEvaluation {
  is_worth_contacting: boolean
  severity: TriggerSeverity
  topic: string
  reasoning: string
  recommended_products: SeenkaProduct[]
  product_reasoning: string
  mentioned_people?: { name: string; role?: string; company?: string }[]
}

export interface GeneratedInsight {
  insight: string
  suggested_message: string
  talking_points: string[]
  recommended_product: SeenkaProduct
}
