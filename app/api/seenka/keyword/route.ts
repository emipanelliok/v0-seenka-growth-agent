import { NextRequest, NextResponse } from "next/server"
import { getSeenkaDataForKeyword } from "@/lib/seenka-mcp"

export async function POST(request: NextRequest) {
  try {
    const { keyword, clientNames, country } = await request.json()

    if (!keyword) {
      return NextResponse.json({ error: "Keyword required" }, { status: 400 })
    }

    const data = await getSeenkaDataForKeyword(keyword, clientNames, country)

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Error fetching Seenka keyword data:", error)
    return NextResponse.json({ error: "Failed to fetch Seenka data" }, { status: 500 })
  }
}
