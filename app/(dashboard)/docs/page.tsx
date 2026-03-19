import { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { readFileSync } from "fs"
import path from "path"
import ReactMarkdown from "react-markdown"

export const metadata: Metadata = {
  title: "Documentación - Seenka Growth Agent",
  description: "Documentación completa del proyecto",
}

export default function DocsPage() {
  try {
    const docsPath = path.join(process.cwd(), "public/docs/documentacion-seenka-growth-agent.md")
    const content = readFileSync(docsPath, "utf-8")

    return (
      <main className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </Link>

          <article className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mb-8">
              <h1 className="mt-0">Seenka Growth Agent</h1>
              <p className="text-muted-foreground mb-0">
                Documentación Completa (Actualizado 2026-03-19)
              </p>
            </div>

            <div className="space-y-8 prose-headings:scroll-mt-20">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-2xl font-bold mt-8 mb-4 border-b pb-2">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xl font-bold mt-6 mb-3">{children}</h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-lg font-semibold mt-4 mb-2">{children}</h4>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm leading-relaxed mb-3">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside space-y-1 mb-4">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside space-y-1 mb-4">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm">{children}</li>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4 border rounded-lg">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-muted border-b">{children}</thead>
                  ),
                  tr: ({ children }) => (
                    <tr className="border-b hover:bg-muted/50">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-2 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-2">{children}</td>
                  ),
                  code: ({ children }) => (
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto mb-4">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary pl-4 py-1 my-4 italic text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-8" />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </article>
        </div>
      </main>
    )
  } catch (error) {
    console.error("Error loading documentation:", error)
    return (
      <main className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h1 className="text-lg font-semibold text-red-900">Error</h1>
            <p className="text-sm text-red-700 mt-2">
              No se pudo cargar la documentación. Por favor intenta más tarde.
            </p>
          </div>
        </div>
      </main>
    )
  }
}
