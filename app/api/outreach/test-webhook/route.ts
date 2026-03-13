import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { webhookUrl } = await request.json()

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "URL del webhook requerida" },
        { status: 400 }
      )
    }

    // Send test payload to webhook
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: "Test desde Seenka Growth Agent",
      champion: {
        name: "Test Champion",
        company: "Test Company",
        linkedin_url: "https://linkedin.com/in/test"
      }
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testPayload)
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Webhook respondió con error: ${response.status}` },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error testing webhook:", error)
    return NextResponse.json(
      { error: "Error al conectar con el webhook" },
      { status: 500 }
    )
  }
}
