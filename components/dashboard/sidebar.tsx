"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import type { User } from "@supabase/supabase-js"
import {
  Users,
  Zap,
  MessageSquare,
  LayoutDashboard,
  LogOut,
  Settings,
  Upload,
  GitBranch,
  CalendarDays,
  Inbox,
  ChevronRight,
  BookOpen,
} from "lucide-react"

interface DashboardSidebarProps {
  user: User
}

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Champions",
    href: "/champions",
    icon: Users,
  },
  {
    title: "Triggers",
    href: "/triggers",
    icon: Zap,
  },
  {
    title: "Secuencias",
    href: "/secuencias",
    icon: GitBranch,
  },
  {
    title: "Efemerides",
    href: "/efemerides",
    icon: CalendarDays,
  },
  {
    title: "Bandeja de Salida",
    href: "/bandeja",
    icon: Inbox,
  },
  {
    title: "Interacciones",
    href: "/interactions",
    icon: MessageSquare,
  },
  {
    title: "Importar",
    href: "/importar",
    icon: Upload,
  },
  {
    title: "Documentación",
    href: "/docs",
    icon: BookOpen,
  },
]

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/25">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">Seenka</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40">Growth Agent</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Menu</p>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-primary-foreground")} />
              <span className="flex-1">{item.title}</span>
              {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user.email?.split("@")[0]}</p>
            <p className="truncate text-xs text-sidebar-foreground/50">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            asChild
          >
            <Link href="/ajustes">
              <Settings className="mr-2 h-4 w-4" />
              Ajustes
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Cerrar sesion</span>
          </Button>
        </div>
      </div>
    </aside>
  )
}
