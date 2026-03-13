import fetch from "node-fetch"

const webhookUrl = "https://v0-seenka-growth-agent.vercel.app/api/webhooks/email-reply"

const payload = {
  from_email: "emiliano@aiweekend.tech",
  subject: "Re: Datos de Coto para Cyber Monday",
  body: "Si me interesa verlo"
}

console.log("[v0] Testing webhook with payload:", JSON.stringify(payload, null, 2))

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})

const data = await response.json()
console.log("[v0] Response status:", response.status)
console.log("[v0] Response body:", JSON.stringify(data, null, 2))
