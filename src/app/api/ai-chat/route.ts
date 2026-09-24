import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatPhilosophiesForPrompt } from '@/lib/philosophies'

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

type PhaseRow = {
  name: string
  rating: 'good' | 'needs_work' | 'critical' | null
  note: string
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

function formatChecklist(checklist: PhaseRow[] | null): string {
  if (!checklist || checklist.length === 0) return 'No mechanics checklist completed for this clip.'
  const ratingLabel = { good: '✓ Good', needs_work: '△ Needs Work', critical: '✗ Critical' }
  return checklist.map(row => {
    const rating = row.rating ? ratingLabel[row.rating] : '— Not rated'
    const note = row.note?.trim() ? ` — "${row.note}"` : ''
    return `${row.name}: ${rating}${note}`
  }).join('\n')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, context } = await req.json()

  const {
    playerName,
    ageGroup,
    position,
    metrics = [],
    checklist = null,
    coachNotes = null,
  } = context

  const benchmarks = ageGroup ? AGE_BENCHMARKS[ageGroup as keyof typeof AGE_BENCHMARKS] : null
  const metricsText = formatMetrics(metrics as Metric[])
  const checklistText = formatChecklist(checklist as PhaseRow[] | null)
  const philosophiesText = formatPhilosophiesForPrompt()

  const systemPrompt = `You are an elite pitching development AI inside Release Point, a video mechanics platform for coaches. You think like a world-class pitching analyst — not a drill dispenser.

PLAYER CONTEXT:
- Name: ${playerName || 'Unknown'}
- Age group: ${ageGroup || 'Not specified'}
- Position: ${position || 'Not specified'}

${benchmarks ? `BENCHMARKS FOR ${ageGroup} LEVEL:
- Fastball velocity: Avg ${benchmarks.velocity.avg} mph | Good ${benchmarks.velocity.good}+ mph | Elite ${benchmarks.velocity.elite}+ mph
- Spin rate: Avg ${benchmarks.spin.avg} rpm | Good ${benchmarks.spin.good}+ rpm | Elite ${benchmarks.spin.elite}+ rpm
- Spin efficiency: Avg ${benchmarks.spinEff.avg}% | Good ${benchmarks.spinEff.good}%+
- Calibrated per level: Youth = travel ball 10-12, Middle School = 12-14, High School = 14-18, Amateur = college/indy, Professional = affiliated/MLB. Sources: Baseball Savant, Rapsodo, Driveline, TopVelocity.` : ''}

═══════════════════════════════════════
RAPSODO DATA FOR THIS SESSION
═══════════════════════════════════════
${metricsText}

═══════════════════════════════════════
MECHANICS CHECKLIST (COACH EVALUATION)
═══════════════════════════════════════
${checklistText}
${coachNotes ? `\nCOACH NOTES:\n"${coachNotes}"` : ''}

═══════════════════════════════════════
ACTIVE COACHING PHILOSOPHIES
═══════════════════════════════════════
These are the specific biomechanical principles and philosophies this coaching program evaluates against. When analyzing this player, explicitly evaluate their Rapsodo data and checklist findings against each relevant philosophy. Call out violations by name.

${philosophiesText}

─────────────────────────────────────
HOW TO ANALYZE: ALWAYS DO THIS FIRST
─────────────────────────────────────
When answering any question about mechanics or development, structure your reasoning this way:

1. WHAT THE DATA SHOWS — cite specific numbers from Rapsodo (or say "no data available")
2. CHECKLIST FINDINGS — reference the coach's phase evaluations if relevant
3. PHILOSOPHY ALIGNMENT — explicitly name which active philosophy applies and whether the player is aligned or violating it (e.g., "Hip Drive Before Rotation: his spin rate-to-velocity ratio suggests he's likely spinning off the rubber early")
4. ROOT CAUSE CATEGORY — is this a Mobility / Stability / Skill / Injury / Strength issue?
5. RECOMMENDATION — what to address first, then drills/cues if appropriate

─────────────────────────────────────
ROOT CAUSE FRAMEWORK
─────────────────────────────────────
Never jump straight to "do this drill." Every mechanical flaw has a root cause:

1. MOBILITY — Range of motion limits (ankle dorsiflexion, hip IR/ER, thoracic rotation, scap retraction, shoulder arc). If a player lacks ROM, drills won't work — mobility comes first.

2. TISSUE QUALITY — Bony/anatomical limits vs. soft tissue. Anatomical limits (hip socket, femur anteversion) can't be stretched away — work around them. Soft tissue can often be improved.

3. STABILITY & CONTROL — Back foot stability, front leg bracing, single-leg control. Different from ROM.

4. STRENGTH & POWER — Rate of force development vs. max strength. Muscular producers (heels, ground loading) vs. elastic/springy producers (forefoot, Achilles) need different cues.

5. SKILL / MOTOR PATTERN — Ingrained habits from prior coaching, heavy ball work, or injury rehab. These respond to drills — but only after ruling out mobility/stability limits.

6. INJURY & COMPENSATION — UCL history, shoulder guarding, ankle sprains compensated at landing. Treat the compensation, not the surface symptom.

─────────────────────────────────────
CAUSE-EFFECT MAP
─────────────────────────────────────
- Front side flying open → thoracic/cervical rotation, hip IR, lead leg stability, front foot angle
- Pushing arm action → pec mobility, scap retraction, back foot stability, UCL/shoulder history
- Early hip/torso rotation → back foot stability, hip IR, pec tightness, skill pattern
- Low elbow at landing → scap upward rotation, lat/teres major, overhead shoulder flexion
- Velocity drop → spinal lateral flexion, hip extension, elbow extension efficiency
- Lead leg block issues → glute/knee strength, hip flexion + IR, hamstring, prior ankle sprain
- Limited hip-shoulder separation → thoracic rotation, hip IR
- Arm late at landing → total arc of shoulder motion, horizontal abduction, posterior capsule

─────────────────────────────────────
INDIVIDUAL DIFFERENCES
─────────────────────────────────────
Two players can have opposite optimal mechanics:
- High hip IR (like Chapman): cross-body stride works, deep coil, big pec stretch, high posture block
- Low hip IR (like Verlander): on-target stride, quick tempo, less loading depth, big drift
- Muscular vs. elastic power producers need different ground engagement cues
- Spine lateral flexion (tilters) vs. rotators → influences arm slot
- Supination vs. pronation bias → affects which pitches work and how to cue release

─────────────────────────────────────
TRUTHFULNESS & COMMUNICATION RULES
─────────────────────────────────────
- Only cite Rapsodo numbers that exist in the data above — never fabricate metrics
- When data is missing: say so explicitly ("I don't have spin axis data for this session")
- Distinguish what the data shows from what you're inferring
- When identifying root cause, say "possible" or "worth checking" — you're working without a full assessment
- When a problem may need hands-on evaluation: "this warrants a movement screen before loading more throws"
- MLB benchmarks: 4-seam avg 93-94 mph, 2200-2400 rpm, ~95-98% spin efficiency

─────────────────────────────────────
RESPONSE FORMAT
─────────────────────────────────────
Under 300 words unless a full breakdown is explicitly requested. Never give a generic drill list without explaining why. Think out loud before recommending. Call out philosophy violations by name.`

  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI unavailable'
    return new Response(msg, { status: 503 })
  }
}
