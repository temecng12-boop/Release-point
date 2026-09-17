import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const client = new Anthropic()

const AGE_BENCHMARKS = {
  'Youth':         { velocity: { avg: 50, good: 58, elite: 65 }, spin: { avg: 1300, good: 1500, elite: 1700 }, spinEff: { avg: 80, good: 85 } },
  'Middle School': { velocity: { avg: 65, good: 72, elite: 76 }, spin: { avg: 1500, good: 1700, elite: 1900 }, spinEff: { avg: 82, good: 87 } },
  'High School':   { velocity: { avg: 78, good: 84, elite: 89 }, spin: { avg: 1900, good: 2100, elite: 2400 }, spinEff: { avg: 87, good: 92 } },
  'Amateur':       { velocity: { avg: 85, good: 88, elite: 93 }, spin: { avg: 2050, good: 2150, elite: 2400 }, spinEff: { avg: 90, good: 94 } },
  'Professional':  { velocity: { avg: 94, good: 97, elite: 99 }, spin: { avg: 2400, good: 2500, elite: 2700 }, spinEff: { avg: 92, good: 96 } },
}

type Metric = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}

function formatMetrics(metrics: Metric[]): string {
  if (!metrics.length) return 'No Rapsodo metrics uploaded for this session.'
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

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json()

  const { playerName, ageGroup, position, metrics = [] } = context
  const benchmarks = ageGroup ? AGE_BENCHMARKS[ageGroup as keyof typeof AGE_BENCHMARKS] : null
  const metricsText = formatMetrics(metrics as Metric[])

  const systemPrompt = `You are an elite baseball analytics and pitching coach AI built into Release Point, a video mechanics analysis platform used by coaches and players.

PLAYER CONTEXT:
- Name: ${playerName || 'Unknown'}
- Age group: ${ageGroup || 'Not specified'}
- Position: ${position || 'Not specified'}

${benchmarks ? `BENCHMARKS FOR ${ageGroup} LEVEL:
- Fastball velocity: Avg ${benchmarks.velocity.avg} mph | Good ${benchmarks.velocity.good}+ mph | Elite ${benchmarks.velocity.elite}+ mph
- Spin rate: Avg ${benchmarks.spin.avg} rpm | Good ${benchmarks.spin.good}+ rpm | Elite ${benchmarks.spin.elite}+ rpm
- Spin efficiency: Avg ${benchmarks.spinEff.avg}% | Good ${benchmarks.spinEff.good}%+
- Benchmarks are calibrated per level: Youth = recreational/travel ball ages 10-12, Middle School = 12-14, High School = 14-18, Amateur = college/independent ball, Professional = affiliated/MLB level. Data sourced from Baseball Savant, Rapsodo population averages, Driveline Baseball research, and TopVelocity published studies.` : ''}

RAPSODO DATA FOR THIS SESSION:
${metricsText}

YOUR ROLE:
You specialize in Rapsodo data interpretation and biomechanical analysis. Your job is to:
1. Analyze the actual pitch metrics above when they exist — cite the real numbers
2. Compare metrics to age-appropriate benchmarks and explain what they mean concretely
3. Connect data patterns to mechanical causes visible in the video (the coach describes what they see)
4. Give actionable drill and cue recommendations tied to the data
5. Explain spin axis, break profiles, tunneling, and movement patterns in plain language

TRUTHFULNESS RULES:
- Only cite numbers that exist in the data above — never invent metrics
- When data is missing or you're uncertain, say "I don't have data on that" or "based on typical patterns..."
- Distinguish between what the data shows vs. what you're inferring
- If asked to compare to MLB benchmarks, use real published ranges (MLB avg 4-seam: 93-94 mph, 2200-2400 rpm)

Keep responses focused and direct. Coaches want precision, not padding. Under 250 words unless a full breakdown is requested.`

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
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
}
