import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAiCoachClipAccess } from '@/lib/ai-coach/access'
import { checkRateLimit } from '@/lib/rate-limit'
import { formatChecklist, formatHittingMetrics, formatMetrics } from '@/lib/ai-coach/prompt'

function anthropic() {
  return new Anthropic()
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

function framesFromBody(raw: unknown): string[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'No frames provided' }
  const frames: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.length < 32 || item.length > 2_000_000) {
      return { error: 'One or more frames were invalid.' }
    }
    frames.push(item)
  }
  return frames
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const limit = await checkRateLimit(user.id, 'analyze-clip', 5, 60)
  if (!limit.allowed) {
    return new Response('Rate limit exceeded. Wait a moment and try again.', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSecs ?? 60) },
    })
  }

  const body = await req.json().catch(() => null) as { clipId?: unknown; frames?: unknown; agent?: unknown } | null
  if (!body) return new Response('Bad request', { status: 400 })

  const access = await requireAiCoachClipAccess(user.id, body.clipId, { requireVideoConsent: true })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const frames = framesFromBody(body.frames)
  if ('error' in frames) return new Response(frames.error, { status: 400 })

  const ctx = access.context
  const agent = body.agent === 'barry' || body.agent === 'randy'
    ? body.agent
    : ctx.clipKind === 'hitting' ? 'barry' : 'randy'

  const metricsText = formatMetrics(ctx.metrics)
  const hittingText = formatHittingMetrics(ctx.hittingMetrics)
  const checklistText = formatChecklist(ctx.checklist)
  const contextText = [
    `Player: ${ctx.playerName || 'Unknown'} | Level: ${ctx.ageGroup || 'Not specified'} | Position: ${ctx.position || 'Not specified'} | This clip: ${ctx.clipKind === 'hitting' ? 'Hitting' : 'Pitching'}`,
    `\nSession data:\n${ctx.clipKind === 'hitting' ? hittingText : metricsText}`,
    `\nMechanics checklist:\n${checklistText}`,
    ctx.coachNotes ? `\nCoach notes: "${ctx.coachNotes}"` : '',
    `\nThe ${frames.length} frames below are extracted at roughly equal intervals across the full clip (early delivery through follow-through). Analyze what you see.`,
  ].filter(Boolean).join('\n')

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: contextText },
    ...frames.map((frame) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: frame },
    })),
    { type: 'text', text: 'Give me your analysis.' },
  ]

  try {
    const stream = await anthropic().messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: agent === 'barry' ? BARRY_SYSTEM : RANDY_SYSTEM,
      messages: [{ role: 'user', content }],
    })

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(new TextEncoder().encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Analysis unavailable'
          controller.error(new Error(msg))
        }
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
