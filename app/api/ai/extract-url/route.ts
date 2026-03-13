import { generateText, Output } from "ai"
import { z } from "zod"

export async function POST(req: Request) {
  try {
    const { url } = await req.json()

    if (!url) {
      return Response.json({ error: "URL es requerida" }, { status: 400 })
    }

    // Try to fetch the URL content
    let pageContent = ""
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SeenkaBot/1.0)",
        },
      })
      if (response.ok) {
        pageContent = await response.text()
        // Extract text content from HTML
        pageContent = pageContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 10000) // Limit content
      }
    } catch {
      // If fetch fails, we'll use AI to work with just the URL
      pageContent = `URL provided: ${url}`
    }

    const { output } = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({
        schema: z.object({
          extracted_content: z.string().describe("El contenido principal del post o artículo"),
          author: z.string().nullable().describe("Nombre del autor del post"),
          author_role: z.string().nullable().describe("Rol/cargo del autor si se menciona"),
          author_company: z.string().nullable().describe("Empresa del autor si se menciona"),
          mentioned_people: z.array(z.object({
            name: z.string(),
            role: z.string().nullable(),
            company: z.string().nullable(),
          })).describe("Personas mencionadas en el post que podrían ser contactos relevantes"),
          topics: z.array(z.string()).describe("Temas principales del post"),
          is_linkedin_post: z.boolean().describe("Si parece ser un post de LinkedIn"),
        }),
      }),
      prompt: `Analiza el siguiente contenido extraído de una URL y extrae la información relevante.

URL: ${url}

Contenido de la página:
${pageContent}

Si es un post de LinkedIn, extrae:
1. El contenido principal del post (el texto que escribió la persona)
2. Información del autor (nombre, rol, empresa)
3. Personas mencionadas o etiquetadas que podrían ser contactos relevantes para ventas B2B
4. Temas principales que se discuten

Si no puedes extraer el contenido (por ejemplo, si LinkedIn bloquea el acceso), indica que es un post de LinkedIn basándote en la URL pero deja el contenido vacío.`,
    })

    return Response.json(output)
  } catch (error) {
    console.error("Error extracting URL:", error)
    return Response.json(
      { error: "Error al extraer contenido de la URL" },
      { status: 500 }
    )
  }
}
