import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { 
  Users, Zap, MessageSquare, TrendingUp, Mail, Linkedin, 
  CalendarDays, Target, Clock, CheckCircle2, ArrowUpRight, 
  ArrowDownRight, Minus, Send, UserCheck, Activity
} from "lucide-react"
import type { Champion, Trigger, Interaction } from "@/lib/types"
import Link from "next/link"

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const [championsRes, triggersRes, interactionsRes, efemeridesRes, outreachRes] = await Promise.all([
    supabase.from("champions").select("*"),
    supabase.from("triggers").select("*"),
    supabase.from("interactions").select("*"),
    supabase.from("efemerides").select("*"),
    supabase.from("outreach_queue").select("*"),
  ])

  const champions = (championsRes.data || []) as Champion[]
  const triggers = (triggersRes.data || []) as Trigger[]
  const interactions = (interactionsRes.data || []) as Interaction[]
  const efemerides = efemeridesRes.data || []
  const outreachQueue = outreachRes.data || []

  // Date calculations
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Champion stats
  const activeChampions = champions.filter(c => c.status !== "paused").length
  const championsThisWeek = champions.filter(c => new Date(c.created_at) > weekAgo).length
  const championsByStatus = {
    listening: champions.filter(c => c.status === "listening").length,
    trigger_detected: champions.filter(c => c.status === "trigger_detected").length,
    contacted: champions.filter(c => c.status === "contacted").length,
    responded: champions.filter(c => c.status === "responded").length,
    opportunity: champions.filter(c => c.status === "opportunity").length,
  }

  // Trigger stats
  const triggersWorthContacting = triggers.filter(t => t.is_worth_contacting).length
  const triggersByPriority = {
    high: triggers.filter(t => t.severity === "high" && t.is_worth_contacting).length,
    medium: triggers.filter(t => t.severity === "medium" && t.is_worth_contacting).length,
    low: triggers.filter(t => t.severity === "low" && t.is_worth_contacting).length,
  }

  // Interaction stats
  const sentInteractions = interactions.filter(i => i.outcome === "sent").length
  const respondedInteractions = interactions.filter(i => i.outcome === "responded").length
  const emailInteractions = interactions.filter(i => i.channel === "email").length
  const linkedinInteractions = interactions.filter(i => i.channel === "linkedin").length
  const responseRate = sentInteractions > 0 ? Math.round((respondedInteractions / sentInteractions) * 100) : 0

  // Outreach queue stats
  const pendingReview = outreachQueue.filter((m: { status: string }) => m.status === "pending_review").length
  const approved = outreachQueue.filter((m: { status: string }) => m.status === "approved").length
  const sent = outreachQueue.filter((m: { status: string }) => m.status === "sent").length

  // Efemerides stats
  const upcomingEfemerides = efemerides.filter((e: { event_date: string; is_active: boolean }) => {
    const eventDate = new Date(e.event_date)
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil >= 0 && daysUntil <= 30 && e.is_active
  }).length

  // Conversion funnel
  const totalFunnel = champions.length || 1
  const contactedRate = Math.round((championsByStatus.contacted / totalFunnel) * 100)
  const respondedRate = Math.round((championsByStatus.responded / totalFunnel) * 100)
  const opportunityRate = Math.round((championsByStatus.opportunity / totalFunnel) * 100)

  const mainStats = [
    {
      title: "Champions Activos",
      value: activeChampions,
      change: championsThisWeek,
      changeLabel: "esta semana",
      icon: Users,
      trend: championsThisWeek > 0 ? "up" : "neutral",
    },
    {
      title: "Triggers Activos",
      value: triggersWorthContacting,
      change: triggersByPriority.high,
      changeLabel: "alta prioridad",
      icon: Zap,
      trend: triggersByPriority.high > 0 ? "up" : "neutral",
    },
    {
      title: "Tasa de Respuesta",
      value: `${responseRate}%`,
      change: respondedInteractions,
      changeLabel: "respuestas totales",
      icon: MessageSquare,
      trend: responseRate > 20 ? "up" : responseRate > 10 ? "neutral" : "down",
    },
    {
      title: "Oportunidades",
      value: championsByStatus.opportunity,
      change: opportunityRate,
      changeLabel: "% de conversion",
      icon: TrendingUp,
      trend: championsByStatus.opportunity > 0 ? "up" : "neutral",
    },
  ]

  const recentTriggers = triggers
    .filter(t => t.is_worth_contacting)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const recentChampions = champions
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
  
  const recentInteractions = interactions
    .filter(i => i.outcome === "responded")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Resumen de tu actividad comercial con IA
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Actualizado ahora</span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mainStats.map((stat, index) => (
          <Card key={stat.title} className="relative overflow-hidden border-0 bg-card shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 rounded-full bg-primary/5" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={cn("rounded-lg p-2", index === 0 ? "bg-primary/10" : index === 1 ? "bg-amber-500/10" : index === 2 ? "bg-emerald-500/10" : "bg-purple-500/10")}>
                <stat.icon className={cn("h-4 w-4", index === 0 ? "text-primary" : index === 1 ? "text-amber-500" : index === 2 ? "text-emerald-500" : "text-purple-500")} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {stat.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                ) : stat.trend === "down" ? (
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={cn("text-xs", stat.trend === "up" ? "text-emerald-600" : stat.trend === "down" ? "text-red-600" : "text-muted-foreground")}>
                  {stat.change} {stat.changeLabel}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Stats Row */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Mail className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{emailInteractions}</p>
                <p className="text-xs text-muted-foreground">Emails enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-500/10 p-2">
                <Linkedin className="h-4 w-4 text-sky-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{linkedinInteractions}</p>
                <p className="text-xs text-muted-foreground">LinkedIn msgs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingReview}</p>
                <p className="text-xs text-muted-foreground">Por revisar</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approved}</p>
                <p className="text-xs text-muted-foreground">Aprobados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Send className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sent}</p>
                <p className="text-xs text-muted-foreground">Enviados cola</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-500/10 p-2">
                <CalendarDays className="h-4 w-4 text-rose-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingEfemerides}</p>
                <p className="text-xs text-muted-foreground">Efemerides prox.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Priority Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversion Funnel */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Funnel de Conversion</CardTitle>
            <CardDescription>Estado de tus champions en el pipeline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Escuchando
                </span>
                <span className="font-medium">{championsByStatus.listening}</span>
              </div>
              <Progress value={100} className="h-2 bg-slate-100" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Trigger detectado
                </span>
                <span className="font-medium">{championsByStatus.trigger_detected}</span>
              </div>
              <Progress value={championsByStatus.trigger_detected / totalFunnel * 100} className="h-2 bg-slate-100 [&>div]:bg-amber-500" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Contactado
                </span>
                <span className="font-medium">{championsByStatus.contacted} ({contactedRate}%)</span>
              </div>
              <Progress value={contactedRate} className="h-2 bg-slate-100 [&>div]:bg-blue-500" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Respondio
                </span>
                <span className="font-medium">{championsByStatus.responded} ({respondedRate}%)</span>
              </div>
              <Progress value={respondedRate} className="h-2 bg-slate-100 [&>div]:bg-emerald-500" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Oportunidad
                </span>
                <span className="font-medium">{championsByStatus.opportunity} ({opportunityRate}%)</span>
              </div>
              <Progress value={opportunityRate} className="h-2 bg-slate-100 [&>div]:bg-purple-500" />
            </div>
          </CardContent>
        </Card>

        {/* Triggers by Priority */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Triggers por Prioridad</CardTitle>
            <CardDescription>Oportunidades activas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm font-medium">Alta</span>
              </div>
              <span className="text-2xl font-bold text-red-600">{triggersByPriority.high}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <span className="text-sm font-medium">Media</span>
              </div>
              <span className="text-2xl font-bold text-amber-600">{triggersByPriority.medium}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-950/20">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-slate-400" />
                <span className="text-sm font-medium">Baja</span>
              </div>
              <span className="text-2xl font-bold text-slate-600">{triggersByPriority.low}</span>
            </div>
            <Link href="/triggers" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline pt-2">
              Ver todos los triggers
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Content Grid - 3 columns */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Triggers */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Triggers Recientes</CardTitle>
              <Link href="/triggers" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentTriggers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Zap className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Sin triggers</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTriggers.map((trigger) => (
                  <div key={trigger.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={cn(
                      "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                      trigger.severity === "high" ? "bg-red-500" :
                      trigger.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{trigger.topic || "Sin tema"}</p>
                      <p className="text-xs text-muted-foreground truncate">{trigger.source_text.substring(0, 60)}...</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Champions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Champions Recientes</CardTitle>
              <Link href="/champions" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentChampions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Sin champions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentChampions.map((champion) => (
                  <Link key={champion.id} href={`/champions/${champion.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground">
                      {champion.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{champion.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{champion.company || "Sin empresa"}</p>
                    </div>
                    <StatusBadge status={champion.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Responses */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Respuestas Recientes</CardTitle>
              <Link href="/interactions" className="text-xs text-primary hover:underline">Ver todas</Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentInteractions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Sin respuestas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentInteractions.map((interaction) => (
                  <div key={interaction.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{interaction.response?.substring(0, 40) || "Respuesta recibida"}...</p>
                      <p className="text-xs text-muted-foreground">{interaction.channel === "email" ? "Email" : "LinkedIn"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    listening: { label: "Escuchando", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    trigger_detected: { label: "Trigger", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    contacted: { label: "Contactado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    responded: { label: "Respondido", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    opportunity: { label: "Oportunidad", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    paused: { label: "Pausado", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  }

  const config = statusConfig[status] || statusConfig.listening

  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", config.className)}>
      {config.label}
    </span>
  )
}
