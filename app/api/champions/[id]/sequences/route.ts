import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/champions/[id]/sequences - Get champion's active sequences
// POST /api/champions/[id]/sequences - Start a sequence for this champion

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("champion_sequences")
    .select(`
      *,
      sequences (*)
    `)
    .eq("champion_id", id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: championId } = await params
  const supabase = await createClient()
  const body = await request.json()

  const { sequence_id, efemeride_id, metadata } = body

  if (!sequence_id) {
    return NextResponse.json({ error: "sequence_id is required" }, { status: 400 })
  }

  // Check if champion is already in this sequence
  const { data: existing } = await supabase
    .from("champion_sequences")
    .select("id, status")
    .eq("champion_id", championId)
    .eq("sequence_id", sequence_id)
    .single()

  if (existing && existing.status === "active") {
    return NextResponse.json({ 
      error: "Champion is already in this sequence",
      existing_id: existing.id
    }, { status: 409 })
  }

  // Get sequence to calculate first step timing
  const { data: sequence } = await supabase
    .from("sequences")
    .select("steps")
    .eq("id", sequence_id)
    .single()

  const steps = (sequence?.steps as Array<{ step: number; delay_days: number }>) || []
  const firstStep = steps.find(function(s) { return s.step === 1 })
  const delayDays = firstStep?.delay_days || 0
  
  const nextStepAt = new Date()
  nextStepAt.setDate(nextStepAt.getDate() + delayDays)

  // If existing but not active, update it
  if (existing) {
    const { data, error } = await supabase
      .from("champion_sequences")
      .update({
        status: "active",
        current_step: 1,
        started_at: new Date().toISOString(),
        next_step_at: nextStepAt.toISOString(),
        trigger_efemeride_id: efemeride_id || null,
        metadata: metadata || {}
      })
      .eq("id", existing.id)
      .select(`*, sequences (*)`)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // Create new
  const { data, error } = await supabase
    .from("champion_sequences")
    .insert({
      champion_id: championId,
      sequence_id,
      current_step: 1,
      status: "active",
      next_step_at: nextStepAt.toISOString(),
      trigger_efemeride_id: efemeride_id || null,
      metadata: metadata || {}
    })
    .select(`*, sequences (*)`)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
