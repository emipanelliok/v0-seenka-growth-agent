import { NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"
import { SEENKA_PRODUCTS } from "@/lib/types"

export async function POST(request: Request) {
  try {
    const profile = await request.json()

    const productsContext = Object.entries(SEENKA_PRODUCTS)
      .map(([key, product]) => 
        `- ${product.name} (${key}): ${product.description}. Casos de uso: ${product.useCases.join(", ")}`
      )
      .join("\n")

    const schema = z.object({
      recommended_products: z.array(z.enum(["content_insight", "ad_insight", "creative_sense", "adsales_radar"])),
      primary_product: z.enum(["content_insight", "ad_insight", "creative_sense", "adsales_radar"]),
      reasoning: z.string(),
      sales_angle: z.string(),
      potential_pain_points: z.array(z.string()),
    })

    const result = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema }),
      prompt: `Sos un experto comercial de Seenka, una empresa de media intelligence.

Analizá este perfil de LinkedIn y recomendá qué productos de Seenka serían más relevantes para esta persona.

**Perfil:**
- Nombre: ${profile.name || "No disponible"}
- Rol: ${profile.role || "No disponible"}
- Empresa: ${profile.company || "No disponible"}
- Industria: ${profile.industry || "No disponible"}
- Headline: ${profile.headline || "No disponible"}
- Experiencias: ${profile.experiences?.slice(0, 3).map((e: any) => `${e.title || "?"} en ${e.company}`).join(", ") || "No disponible"}

**Productos de Seenka:**
${productsContext}

**Instrucciones:**
1. Identificá qué productos serían más relevantes basándote en el rol, industria y empresa
2. Explicá brevemente por qué esos productos serían útiles
3. Sugerí un ángulo de venta específico para esta persona
4. Identificá 2-3 posibles pain points que Seenka podría resolver

Respondé en español.`,
    })

    if (!result.object) {
      console.error("[v0] AI returned no object, full result:", JSON.stringify(result, null, 2))
      return NextResponse.json(
        { error: "La IA no pudo generar recomendaciones" },
        { status: 500 }
      )
    }

    const analysis = result.object
    return NextResponse.json({
      recommended_products: analysis.recommended_products,
      primary_product: analysis.primary_product,
      product_reasoning: analysis.reasoning,
      sales_angle: analysis.sales_angle,
      potential_pain_points: analysis.potential_pain_points
    })
  } catch (error) {
    console.error("Error analyzing profile:", error)
    return NextResponse.json(
      { error: "Error al analizar el perfil" },
      { status: 500 }
    )
  }
}
