"use client"

import { useState } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Mail, 
  Linkedin, 
  Phone,
  MapPin,
  Building2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Loader2,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import type { Champion, ChampionStatus } from "@/lib/types"
import { STATUS_LABELS, LEVEL_LABELS, CHAMPION_TYPE_LABELS } from "@/lib/types"

interface ChampionProfileHeaderProps {
  champion: Champion
  status: ChampionStatus
  onStatusChange: (status: ChampionStatus) => void
  isUpdating: boolean
  onEdit: () => void
  onRefreshLinkedIn: () => void
  isRefreshingLinkedIn: boolean
  onOpenSeenka: () => void
  onGenerateMessage: () => void
  hasCompanyData: boolean
  hasTriggers: boolean
}

export function ChampionProfileHeader({
  champion,
  status,
  onStatusChange,
  isUpdating,
  onEdit,
  onRefreshLinkedIn,
  isRefreshingLinkedIn,
  onOpenSeenka,
  onGenerateMessage,
  hasCompanyData,
  hasTriggers,
}: ChampionProfileHeaderProps) {
  const [copiedEmail, setCopiedEmail] = useState(false)

  const handleCopyEmail = function() {
    if (champion.email) {
      navigator.clipboard.writeText(champion.email)
      setCopiedEmail(true)
      setTimeout(function() { setCopiedEmail(false) }, 2000)
    }
  }

  const getInitials = function(name: string) {
    return name
      .split(" ")
      .map(function(n) { return n[0] })
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getStatusColor = function(s: ChampionStatus) {
    switch (s) {
      case "active": return "bg-emerald-500"
      case "engaged": return "bg-blue-500"
      case "nurturing": return "bg-amber-500"
      case "inactive": return "bg-zinc-400"
      case "lost": return "bg-red-500"
      default: return "bg-zinc-400"
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* Top section with gradient */}
      <div className="h-24 rounded-t-xl bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-zinc-800" />
      
      {/* Profile content */}
      <div className="px-6 pb-6">
        {/* Avatar and basic info */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
          {/* Avatar */}
          <div className="relative">
            {champion.photo_url ? (
              <Image
                src={champion.photo_url}
                alt={champion.name}
                width={96}
                height={96}
                className="rounded-full border-4 border-background bg-background object-cover"
              />
            ) : (
              <div className="h-24 w-24 rounded-full border-4 border-background bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-semibold text-primary">
                  {getInitials(champion.name)}
                </span>
              </div>
            )}
            {/* Status dot */}
            <div className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background ${getStatusColor(status)}`} />
          </div>

          {/* Name and title */}
          <div className="flex-1 sm:pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{champion.name}</h1>
              {champion.champion_type && (
                <Badge variant="secondary" className="text-xs">
                  {CHAMPION_TYPE_LABELS[champion.champion_type] || champion.champion_type}
                </Badge>
              )}
              {champion.champion_level && (
                <Badge variant="outline" className="text-xs">
                  {LEVEL_LABELS[champion.champion_level] || champion.champion_level}
                </Badge>
              )}
            </div>
            {champion.role && (
              <p className="text-muted-foreground mt-0.5">{champion.role}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:pb-1">
            <Select value={status} onValueChange={function(v) { onStatusChange(v as ChampionStatus) }} disabled={isUpdating}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(function([value, label]) {
                  return (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar perfil
                </DropdownMenuItem>
                {champion.linkedin_url && (
                  <DropdownMenuItem onClick={onRefreshLinkedIn} disabled={isRefreshingLinkedIn}>
                    {isRefreshingLinkedIn ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Actualizar LinkedIn
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Contact info row */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {champion.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{champion.company}</span>
            </div>
          )}
          {champion.country && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{champion.country}</span>
            </div>
          )}
          {champion.email && (
            <button 
              onClick={handleCopyEmail}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
            >
              <Mail className="h-4 w-4" />
              <span>{champion.email}</span>
              {copiedEmail ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
          {champion.linkedin_url && (
            <a 
              href={champion.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Linkedin className="h-4 w-4" />
              <span>LinkedIn</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Headline */}
        {champion.headline && (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {champion.headline}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-2">
          {hasCompanyData && (
            <Button variant="outline" size="sm" onClick={onOpenSeenka}>
              <Sparkles className="mr-2 h-4 w-4" />
              Consultar Seenka
            </Button>
          )}
          {hasTriggers && (
            <Button size="sm" onClick={onGenerateMessage}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generar Mensaje
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
