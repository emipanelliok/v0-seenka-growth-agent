import { SequenceBuilder } from "@/components/sequences/sequence-builder"

export const metadata = {
  title: "Secuencias - Seenka Growth Agent",
  description: "Configurá las secuencias de mensajes de seguimiento",
}

export default function SecuenciasPage() {
  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-6">
      <SequenceBuilder />
    </div>
  )
}
