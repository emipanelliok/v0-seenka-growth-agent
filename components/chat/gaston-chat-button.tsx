"use client"

import { useState, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

const GastonChatPanel = lazy(() =>
  import("./gaston-chat-panel").then((m) => ({ default: m.GastonChatPanel }))
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
      {hasOpened && (
        <Suspense fallback={null}>
          <GastonChatPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
