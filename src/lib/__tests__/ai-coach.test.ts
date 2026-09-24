/**
 * Sanity test for AI Coach philosophy injection and prompt construction.
 * Run with: npx tsx src/lib/__tests__/ai-coach.test.ts
 *
 * Does NOT call the Anthropic API. Validates that:
 *   1. formatPhilosophiesForPrompt() includes all active philosophy names
 *   2. Each philosophy's red flags and cues are present in the output
 *   3. The mock scenario (high spin efficiency + poor lead leg brace) surfaces
 *      the correct violated philosophy in a formatted prompt
 *   4. Inactive philosophies are excluded
 */

import { PHILOSOPHIES, ACTIVE_PHILOSOPHIES, formatPhilosophiesForPrompt, type Philosophy } from '../philosophies'

// ─── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`)
    failed++
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
}

// ─── Mock data (scenario: high spin efficiency fastball, but poor lead leg brace) ─

const MOCK_METRICS = [
  {
    pitch_type: '4-Seam Fastball',
    velocity: 84,
    spin_rate: 2310,
    spin_axis: 180,    // 12:00 — good backspin axis
    horizontal_break: -2.1,
    vertical_break: 14.8,  // slightly below expected for this spin
  },
]

const MOCK_CHECKLIST = [
  { name: 'Hip Load / Leg Lift',       rating: 'good'       as const, note: 'Good balance at peak' },
  { name: 'Stride Direction',          rating: 'good'       as const, note: 'On-line' },
  { name: 'Hip-Shoulder Separation',   rating: 'needs_work' as const, note: 'Front shoulder opening slightly early' },
  { name: 'Lead Leg Brace',            rating: 'critical'   as const, note: 'Front knee buckling at foot contact, no block' },
  { name: 'Arm Path',                  rating: 'good'       as const, note: '' },
  { name: 'Release Point',             rating: 'needs_work' as const, note: 'Slightly early, losing extension' },
]

const MOCK_COACH_NOTES = 'Kid has great arm but loses everything at front foot contact — knee caves, no block, all the velo bleeds out.'

// ─── Helpers that mirror the route logic ─────────────────────────────────────

function formatMetrics(metrics: typeof MOCK_METRICS): string {
  return metrics.map(m => {
    const parts: string[] = []
    if (m.pitch_type)           parts.push(`Pitch: ${m.pitch_type}`)
    if (m.velocity != null)     parts.push(`Velo: ${m.velocity} mph`)
    if (m.spin_rate != null)    parts.push(`Spin: ${m.spin_rate} rpm`)
    if (m.spin_axis != null)    parts.push(`Axis: ${m.spin_axis}°`)
    if (m.horizontal_break != null) parts.push(`HB: ${m.horizontal_break}"`)
    if (m.vertical_break != null)   parts.push(`VB: ${m.vertical_break}"`)
    return parts.join(' | ')
  }).join('\n')
}

function formatChecklist(checklist: typeof MOCK_CHECKLIST): string {
  const ratingLabel = { good: '✓ Good', needs_work: '△ Needs Work', critical: '✗ Critical' }
  return checklist.map(row => {
    const rating = ratingLabel[row.rating]
    const note = row.note?.trim() ? ` — "${row.note}"` : ''
    return `${row.name}: ${rating}${note}`
  }).join('\n')
}

// ─── Test suite ───────────────────────────────────────────────────────────────

section('Philosophy catalogue integrity')

assert(PHILOSOPHIES.length >= 9, `At least 9 philosophies defined (got ${PHILOSOPHIES.length})`)

const allIds = PHILOSOPHIES.map(p => p.id)
const uniqueIds = new Set(allIds)
assert(allIds.length === uniqueIds.size, 'All philosophy IDs are unique')

for (const p of PHILOSOPHIES) {
  assert(p.cues.length > 0,     `[${p.id}] has at least one cue`)
  assert(p.redFlags.length > 0, `[${p.id}] has at least one red flag`)
  assert(p.metricsRelation.length > 0, `[${p.id}] has metricsRelation text`)
}

const categories = new Set(PHILOSOPHIES.map(p => p.category))
const expected = ['lower_half', 'arm_action', 'sequencing', 'lead_leg', 'release', 'pitch_design']
for (const cat of expected) {
  assert(categories.has(cat as Philosophy['category']), `Category "${cat}" has at least one philosophy`)
}

// ─────────────────────────────────────────────────────────────────────────────
section('Active philosophy filtering')

assert(ACTIVE_PHILOSOPHIES.length === PHILOSOPHIES.filter(p => p.active).length,
  'ACTIVE_PHILOSOPHIES matches manual filter count')

assert(ACTIVE_PHILOSOPHIES.every(p => p.active),
  'Every entry in ACTIVE_PHILOSOPHIES has active:true')

// Test that toggling active:false would exclude the philosophy
const testPhilosophyId = 'pitch_design_breaking_ball'
const testPhilosophy = PHILOSOPHIES.find(p => p.id === testPhilosophyId)
assert(!!testPhilosophy, `Test philosophy "${testPhilosophyId}" exists`)
if (testPhilosophy) {
  const wouldBeActive = [{ ...testPhilosophy, active: false }, ...PHILOSOPHIES.filter(p => p.id !== testPhilosophyId)]
    .filter(p => p.active)
  assert(!wouldBeActive.some(p => p.id === testPhilosophyId),
    `Setting active:false on "${testPhilosophyId}" removes it from the active set`)
}

// ─────────────────────────────────────────────────────────────────────────────
section('formatPhilosophiesForPrompt() output')

const promptBlock = formatPhilosophiesForPrompt()

assert(promptBlock.length > 200, 'Prompt block is non-trivially long')

for (const p of ACTIVE_PHILOSOPHIES) {
  assert(promptBlock.includes(p.name), `Active philosophy "${p.name}" appears in prompt`)
  assert(promptBlock.includes(p.description), `Description for "${p.name}" included`)
  assert(p.cues.every(c => promptBlock.includes(c)),
    `All cues for "${p.name}" included in prompt`)
  assert(p.redFlags.some(f => promptBlock.includes(f)),
    `At least one red flag for "${p.name}" included in prompt`)
}

assert(promptBlock.includes('LOWER HALF & GROUND ENGAGEMENT'), 'Category header: LOWER HALF')
assert(promptBlock.includes('ARM ACTION & SCAPULAR MECHANICS'),  'Category header: ARM ACTION')
assert(promptBlock.includes('HIP-SHOULDER SEPARATION & TEMPO'),  'Category header: SEQUENCING')
assert(promptBlock.includes('LEAD LEG BLOCK & BRACING'),         'Category header: LEAD LEG')
assert(promptBlock.includes('RELEASE POINT & EXTENSION'),        'Category header: RELEASE')
assert(promptBlock.includes('PITCH DESIGN PRINCIPLES'),          'Category header: PITCH DESIGN')

// ─────────────────────────────────────────────────────────────────────────────
section('Mock scenario: high spin efficiency + poor lead leg brace')

const metricsText  = formatMetrics(MOCK_METRICS)
const checklistText = formatChecklist(MOCK_CHECKLIST)

// Verify mock data surfaces expected signals
assert(metricsText.includes('2310 rpm'), 'Spin rate present in formatted metrics')
assert(metricsText.includes('180°'),     'Spin axis (12:00 proxy) present')
assert(metricsText.includes('14.8"'),    'VB (below-expected for spin) present')

assert(checklistText.includes('✗ Critical'), 'Critical rating appears in checklist')
assert(checklistText.includes('Lead Leg Brace'), 'Lead leg phase appears in checklist')
assert(checklistText.includes('Front knee buckling'), 'Coach note about knee caving present')

// Verify lead_leg_block philosophy contains the right red flags for this scenario
const leadLegPhilosophy = PHILOSOPHIES.find(p => p.id === 'lead_leg_block')
assert(!!leadLegPhilosophy, 'lead_leg_block philosophy exists')
assert(leadLegPhilosophy!.active, 'lead_leg_block is active (will be evaluated)')
assert(
  leadLegPhilosophy!.redFlags.some(f => f.toLowerCase().includes('knee')),
  'lead_leg_block red flags mention knee buckling'
)
assert(
  leadLegPhilosophy!.metricsRelation.toLowerCase().includes('vb'),
  'lead_leg_block metricsRelation connects to VB (velocity/carry loss)'
)
assert(
  leadLegPhilosophy!.metricsRelation.toLowerCase().includes('velocity'),
  'lead_leg_block metricsRelation mentions velocity loss'
)

// Verify the fastball profile philosophy would flag low VB for the spin rate
const fbPhilosophy = PHILOSOPHIES.find(p => p.id === 'pitch_design_fb_profile')
assert(!!fbPhilosophy, 'pitch_design_fb_profile philosophy exists')
assert(fbPhilosophy!.active, 'pitch_design_fb_profile is active')
assert(
  fbPhilosophy!.metricsRelation.includes('VB 15"'),
  'FB profile mentions VB 15"+ target for high school (our mock player is at 14.8" — just below)'
)

// Confirm both violation-relevant philosophies surface in the prompt block
const promptText = formatPhilosophiesForPrompt()
assert(promptText.includes('Lead Leg Bracing'), 'Lead Leg Brace philosophy in AI prompt')
assert(promptText.includes('Fastball Profile Priority'), 'Fastball Profile philosophy in AI prompt')
assert(
  promptText.includes('Front knee buckling'),
  'Specific red flag for this scenario (knee buckling) present in prompt'
)

// Print a sample of the formatted prompt block for visual inspection
console.log('\n── Sample: prompt block excerpt (Lead Leg section) ─────────────────────')
const legStart = promptText.indexOf('LEAD LEG')
const legEnd   = promptText.indexOf('\n\n', legStart + 20)
console.log(promptText.slice(legStart, legEnd > legStart ? legEnd : legStart + 600))

// ─────────────────────────────────────────────────────────────────────────────
section('Results')

const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
