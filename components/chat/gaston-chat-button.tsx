"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import { GastonChatPanel } from "./gaston-chat-panel"

export function GastonChatButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 hover:scale-105"
      >
        <Sparkles className="h-6 w-6" />
        <span className="sr-only">Chat con Gastón</span>
      </Button>
      <GastonChatPanel open={open} onOpenChange={setOpen} />
    </>
  )
}
