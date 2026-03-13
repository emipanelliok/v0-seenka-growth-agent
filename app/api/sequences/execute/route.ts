import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

// POST /api/sequences/execute - Execute pending sequence steps
// This should be called by a cron job or manually to process sequences

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  // Get all champion_sequences that are due for next step
  const now = new Date().toISOString()
  
  const { data: dueSequences, error } = await supabase
    .from("champion_sequences")
    .select(`
      *,
      sequences (*),
      champions (id, name, email, company, role, headline, country, status)
    `)
    .eq("status", "active")
    .lte("next_step_at", now)
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueSequences || dueSequences.length === 0) {
    return NextResponse.json({ 
      processed: 0, 
      message: "No sequences due for execution" 
    })
  }

  const results: Array<{ champion_id: string; status: string; message?: string }> = []

  for (const cs of dueSequences) {
    try {
      const sequence = cs.sequences as {
        id: string
        name: string
        channel: string
        steps: Array<{ step: number; delay_days: number; template: string }>
      }
      const champion = cs.champions as {
        id: string
        name: string
        email: string
        company: string
        role: string
        headline: string
        country: string
        status: string
      }

      if (!sequence || !champion) {
        results.push({ champion_id: cs.champion_id, status: "skipped", message: "Missing data" })
        continue
      }

      const steps = sequence.steps || []
      const currentStepData = steps.find(function(s) { return s.step === cs.current_step })

      if (!currentStepData) {
        // No more steps, mark as completed
        await supabase
          .from("champion_sequences")
          .update({ status: "completed" })
          .eq("id", cs.id)
        
        results.push({ champion_id: cs.champion_id, status: "completed", message: "No more steps" })
        continue
      }

      // Generate message from template
      const message = await generateSequenceMessage(
        currentStepData.template,
        champion,
        cs.current_step,
        cs.metadata as Record<string, unknown>
      )

      // Queue the message in outreach_queue
      await supabase
        .from("outreach_queue")
        .insert({
          champion_id: champion.id,
          trigger_type: "sequence",
          trigger_id: sequence.id,
          channel: sequence.channel,
          subject: message.subject,
          message: message.body,
          status: "pending_review",
          metadata: {
            sequence_id: sequence.id,
            sequence_name: sequence.name,
            step: cs.current_step,
            champion_sequence_id: cs.id
          }
        })

      // Calculate next step timing
      const nextStep = cs.current_step + 1
      const nextStepData = steps.find(function(s) { return s.step === nextStep })

      if (nextStepData) {
        const nextStepAt = new Date()
        nextStepAt.setDate(nextStepAt.getDate() + nextStepData.delay_days)

        await supabase
          .from("champion_sequences")
          .update({
            current_step: nextStep,
            last_step_at: new Date().toISOString(),
            next_step_at: nextStepAt.toISOString()
          })
          .eq("id", cs.id)
      } else {
        // This was the last step
        await supabase
          .from("champion_sequences")
          .update({
            last_step_at: new Date().toISOString(),
            next_step_at: null,
            status: "completed"
          })
          .eq("id", cs.id)
      }

      results.push({ 
        champion_id: cs.champion_id, 
        status: "queued", 
        message: `Step ${cs.current_step} queued for review` 
      })

    } catch (e) {
      results.push({ 
        champion_id: cs.champion_id, 
        status: "error", 
        message: String(e) 
      })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results
  })
}

// Generate a personalized message from template
async function generateSequenceMessage(
  template: string,
  champion: {
    name: string
    email: string
    company: string
    role: string
    headline: string
    country: string
  },
  step: number,
  metadata: Record<string, unknown>
): Promise<{ subject: string; body: string }> {
  
  // If template has placeholders, use AI to fill them
  const prompt = `Generate a follow-up email (step ${step} of a sequence) based on this template and contact info.

TEMPLATE:
${template}

CONTACT:
- Name: ${champion.name}
- Company: ${champion.company || "N/A"}
- Role: ${champion.role || champion.headline || "N/A"}
- Country: ${champion.country || "N/A"}

PREVIOUS CONTEXT:
${JSON.stringify(metadata, null, 2)}

Generate a natural, personalized email. Output in this exact format:
SUBJECT: [your subject line]
BODY:
[your email body with proper line breaks]

Rules:
- Keep it brief and conversational
- Reference previous outreach if this is a follow-up
- Don't be pushy, be helpful
- No markdown formatting in the body`

  try {
    const { text } = await generateText({
      model: gateway("openai/gpt-4o-mini"),
      prompt,
      maxTokens: 500
    })

    // Parse the response
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i)

    return {
      subject: subjectMatch ? subjectMatch[1].trim() : `Follow-up ${step}`,
      body: bodyMatch ? bodyMatch[1].trim() : template
    }
  } catch (e) {
    // Fallback to simple template replacement
    return {
      subject: `Follow-up ${step}`,
      body: template
        .replace(/\{name\}/gi, champion.name.split(" ")[0])
        .replace(/\{company\}/gi, champion.company || "")
        .replace(/\{role\}/gi, champion.role || "")
    }
  }
}

// GET to check pending sequences
export async function GET() {
  const supabase = await createClient()
  const now = new Date().toISOString()
  
  const { data, error } = await supabase
    .from("champion_sequences")
    .select("id, champion_id, current_step, next_step_at, status")
    .eq("status", "active")
    .lte("next_step_at", now)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    pending_count: data?.length || 0,
    sequences: data
  })
}
