import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/sequences - List all sequences
// POST /api/sequences - Create a new sequence

export async function GET() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("sequences")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()

  const { name, description, trigger_type, channel, steps } = body

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("sequences")
    .insert({
      name,
      description: description || null,
      trigger_type: trigger_type || "efemeride",
      channel: channel || "email",
      steps: steps || [],
      is_active: true
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
