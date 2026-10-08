import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

type Metric = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}

type PhaseRow = {
  name: string
  rating: 'good' | 'needs_work' | 'critical' | null
  note: string
}

function formatMetrics(metrics: Metric[]): string {
  if (!metrics.length) return 'No pitch metrics for this session.'
  return metrics.map(m => {
    const parts: string[] = []
    if (m.pitch_type) parts.push(`Pitch: ${m.pitch_type}`)
    if (m.velocity != null) parts.push(`Velo: ${m.velocity} mph`)
    if (m.spin_rate != null) parts.push(`Spin: ${m.spin_rate} rpm`)
    if (m.spin_axis != null) parts.push(`Axis: ${m.spin_axis}°`)
    if (m.horizontal_break != null) parts.push(`HB: ${m.horizontal_break}"`)
    if (m.vertical_break != null) parts.push(`VB: ${m.vertical_break}"`)
    return parts.join(' | ')
  }).join('\n')
}

function formatChecklist(checklist: PhaseRow[] | null): string {
  if (!checklist || checklist.length === 0) return 'No mechanics checklist for this clip.'
  const ratingLabel = { good: '✓ Good', needs_work: '△ Needs Work', critical: '✗ Critical' }
  return checklist.map(row => {
    const rating = row.rating ? ratingLabel[row.rating] : '— Not rated'
    const note = row.note?.trim() ? ` — "${row.note}"` : ''
    return `${row.name}: ${rating}${note}`
  }).join('\n')
}

const RANDY_SYSTEM = `You are Randy — pitching coach. You've just reviewed video frames of a pitcher's delivery. Analyze only what you can see. Do not mention what you cannot see.

Output exactly this structure — no intro, no filler, start immediately with the headers:

**What's Working**
[1-3 positive mechanical observations based on visible frames]

**Watch**
[1-2 things that could become issues or aren't visible enough to confirm yet]

**Priority Focus**
[The single most important mechanical adjustment based on what you see]

Rules:
- Every point must be grounded in what's visible in the frames (balance point, stride, rotation, arm path, release, follow-through)
- If a phase isn't clearly visible, say so rather than guessing
- Reference specific mechanics: hip-shoulder separation, front leg bracing, arm slot, head position, stride length, knee drive, finish
- Under 200 words total
- No generic advice — be specific to this pitcher`

const BARRY_SYSTEM = `You are Barry — hitting coach. You've just reviewed video frames of a hitter's swing. Analyze only what you can see. Do not mention what you cannot see.

Output exactly this structure — no intro, no filler, start immediately with the headers:

**What's Working**
[1-3 positive mechanical observations based on visible frames]

**Watch**
[1-2 things that could become issues or aren't visible enough to confirm yet]

**Priority Focus**
[The single most important mechanical adjustment based on what you see]

Rules:
- Every point must be grounded in what's visible in the frames (stance, load, stride, hip rotation, hand path, contact, extension, finish)
- If a phase isn't clearly visible, say so rather than guessing
- Reference specific mechanics: hip hinge, load position, stride toe touch, hip-to-shoulder separation, barrel path, contact point depth, extension, finish height
- Under 200 words total
- No generic advice — be specific to this hitter`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 5 vision analyses per user per minute
  const limit = await checkRateLimit(user.id, 'analyze-clip', 5, 60)
  if (!limit.allowed) {
    return new Response('Rate limit exceeded. Wait a moment and try again.', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSecs ?? 60) },
    })
  }

  const {
    frames,
    agent = 'randy',
    playerName,
    playerAgeGroup,
    playerPosition,
    metrics = [],
    checklist = null,
    coachNotes = null,
  } = await req.json()

  if (!frames || frames.length === 0) {
    return new Response('No frames provided', { status: 400 })
  }

  const metricsText   = formatMetrics(metrics as Metric[])
  const checklistText = formatChecklist(checklist as PhaseRow[] | null)

  const contextText = [
    `Player: ${playerName || 'Unknown'} | Level: ${playerAgeGroup || 'Not specified'} | Position: ${playerPosition || 'Not specified'}`,
    `\nSession data:\n${metricsText}`,
    `\nMechanics checklist:\n${checklistText}`,
    coachNotes ? `\nCoach notes: "${coachNotes}"` : '',
    `\nThe ${frames.length} frames below are extracted at roughly equal intervals across the full clip (early delivery through follow-through). Analyze what you see.`,
  ].filter(Boolean).join('\n')

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: contextText },
    ...frames.map((frame: string) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: frame },
    })),
    { type: 'text', text: 'Give me your analysis.' },
  ]

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: agent === 'barry' ? BARRY_SYSTEM : RANDY_SYSTEM,
      messages: [{ role: 'user', content }],
    })

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis unavailable'
    return new Response(msg, { status: 503 })
  }
}
