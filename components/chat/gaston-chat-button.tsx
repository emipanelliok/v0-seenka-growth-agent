"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

// Dynamic import with ssr: false ensures useChat (from @ai-sdk/react)
// never runs during server-side rendering
const GastonChatPanel = dynamic(
  () => import("./gaston-chat-panel").then((mod) => ({ default: mod.GastonChatPanel })),
  { ssr: false, loading: () => null }
)

export function GastonChatButton() {
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  const handleOpen = () => {
    setHasOpened(true)
    setOpen(true)
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        size="lg"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 hover:scale-105"
      >
        <Sparkles className="h-6 w-6" />
        <span className="sr-only">Chat con Gastón</span>
      </Button>
      {hasOpened && <GastonChatPanel open={open} onOpenChange={setOpen} />}
    </>
  )
}
