"use client"

import { cn } from "@/lib/utils"
import { Bot, User, Wrench, ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

interface ChatMessageProps {
  role: "user" | "assistant" | "tool" | "system"
  parts?: any[]
  content?: string
  toolInvocations?: any[]
}

// Extract text content from a message (supports both UIMessage parts and legacy content)
function getTextContent(props: ChatMessageProps): string {
  // If parts array exists (UIMessage v3 format), extract text parts
  if (props.parts && Array.isArray(props.parts)) {
    return props.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || "")
      .join("")
  }
  // Fallback to content string
  if (typeof props.content === "string") return props.content
  return ""
}

// Extract tool invocations from parts
function getToolInvocations(props: ChatMessageProps): any[] {
  const fromParts = props.parts
    ?.filter((p: any) => p.type === "tool-invocation")
    || []
  const fromProp = props.toolInvocations || []
  return fromParts.length > 0 ? fromParts : fromProp
}

export function ChatMessage(props: ChatMessageProps) {
  const { role } = props
  const content = getTextContent(props)
  const toolInvocations = getToolInvocations(props)

  return (
    <div className={cn("flex gap-3 px-4 py-3", role === "user" && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={cn("flex flex-col gap-2 max-w-[85%]", role === "user" && "items-end")}>
        {/* Tool invocations */}
        {toolInvocations.length > 0 && (
          <div className="space-y-2">
            {toolInvocations.map((invocation: any, i: number) => (
              <ToolInvocationCard key={i} invocation={invocation} />
            ))}
          </div>
        )}

        {/* Text content */}
        {content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            )}
          >
            {role === "assistant" ? (
              <div dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }} />
            ) : (
              <p className="m-0 whitespace-pre-wrap">{content}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolInvocationCard({ invocation }: { invocation: any }) {
  const [expanded, setExpanded] = useState(false)
  // Support both formats: { toolName } and { toolInvocation: { toolName } }
  const toolCall = invocation.toolInvocation || invocation
  const toolName = toolCall.toolName || toolCall.name || "herramienta"
  const state = toolCall.state // "call" | "result" | "partial-call"
  const isLoading = state === "call" || state === "partial-call"

  const displayName = toolDisplayNames[toolName] || toolName.replace(/_/g, " ")

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      <button
        onClick={() => !isLoading && setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{displayName}</span>
        {isLoading ? (
          <span className="ml-auto text-muted-foreground animate-pulse">Ejecutando...</span>
        ) : (
          <span className="ml-auto text-muted-foreground">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {expanded && toolCall.result && (
        <div className="border-t px-3 py-2 bg-muted/30">
          <pre className="text-xs text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap">
            {typeof toolCall.result === "string"
              ? toolCall.result
              : JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

const toolDisplayNames: Record<string, string> = {
  list_champions: "Buscando champions",
  get_champion: "Consultando champion",
  create_champion: "Creando champion",
  update_champion: "Actualizando champion",
  list_pending_messages: "Revisando cola de mensajes",
  generate_message: "Generando mensaje",
  send_message: "Encolando mensaje",
  get_interactions: "Consultando interacciones",
  list_efemerides: "Consultando efemérides",
  create_efemeride: "Creando efeméride",
  get_pipeline_stats: "Calculando estadísticas",
  analyze_performance: "Analizando rendimiento",
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
    .replace(/^### (.*$)/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-base font-semibold mt-3 mb-1">$1</h2>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n/g, "<br>")
}
