"use client"

import { useChat } from "@ai-sdk/react"
import { useEffect, useRef, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChatMessage } from "./chat-message"
import { Send, Loader2, Sparkles, RotateCcw } from "lucide-react"

interface GastonChatPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GastonChatPanel({ open, onOpenChange }: GastonChatPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, append } = useChat({
    api: "/api/chat",
    body: { conversationId },
    onResponse: (response) => {
      const convId = response.headers.get("X-Conversation-Id")
      if (convId && !conversationId) {
        setConversationId(convId)
      }
    },
  })

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleNewConversation = () => {
    setConversationId(null)
    setMessages([])
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-[480px] [&>button]:hidden"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <SheetTitle className="text-base">Gastón</SheetTitle>
                <p className="text-[11px] text-muted-foreground">Copiloto de Growth</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewConversation}
              title="Nueva conversación"
              className="h-8 w-8"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggestionClick={(text) => append({ role: "user", content: text })} />
          ) : (
            <div className="py-4">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as any}
                  content={msg.content}
                  toolInvocations={msg.toolInvocations}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">
                    <span className="text-sm text-muted-foreground animate-pulse">
                      Pensando...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Preguntale a Gastón..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Hola, soy Gastón</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Tu copiloto de growth. Podés preguntarme sobre tus champions, generar mensajes, consultar datos o analizar resultados.
      </p>
      <div className="grid gap-2 w-full max-w-xs">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(s)}
            className="rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

const suggestions = [
  "¿Qué champions tenemos en el pipeline?",
  "¿Cómo fue el rendimiento de los últimos 30 días?",
  "Creá una efeméride de Hot Sale para Argentina",
  "Generá un mensaje para un champion de retail",
]
