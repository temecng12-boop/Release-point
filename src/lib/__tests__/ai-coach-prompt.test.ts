/**
 * AI Coach clip context (RP-044). Does not call Anthropic or Supabase.
 * Run with: npx tsx --test src/lib/__tests__/ai-coach-prompt.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  VIDEO_ACCESS_NOTE, cleanCoachNotes, formatChecklist, formatClipDetails, formatClipTime, formatHittingMetrics,
  formatMetrics, formatTimestampNotes, MAX_PROMPT_METRICS,
} from '../ai-coach/prompt'

const routeSource = readFileSync(join(__dirname, '../../app/api/ai-chat/route.ts'), 'utf8')
const clipBlockSource = routeSource.slice(routeSource.indexOf('function buildClipBlock('), routeSource.indexOf('function buildBarryPrompt('))
const barrySource = routeSource.slice(routeSource.indexOf('function buildBarryPrompt('), routeSource.indexOf('export async function POST'))
const randySource = routeSource.slice(routeSource.indexOf("You are Randy"), routeSource.indexOf('try {'))

test('the video-access note tells the model it has text only and must not ask for an attachment', () => {
  assert.match(VIDEO_ACCESS_NOTE, /cannot watch, play or see the video/)
  assert.match(VIDEO_ACCESS_NOTE, /never say a video or attachment is missing/)
  assert.match(VIDEO_ACCESS_NOTE, /notes and metrics/)
  assert.match(VIDEO_ACCESS_NOTE, /working from the coach's notes and data, not the footage/)
})

test('the shared clip block has the video note, clip details and timestamped notes', () => {
  for (const expr of ['${VIDEO_ACCESS_NOTE}', '${clipText}', '${timestampNotesText']) {
    assert.ok(clipBlockSource.includes(expr), `clip block should interpolate ${expr}`)
  }
})

test('both Randy and Barry prompts include the clip block, metrics, checklist and coach notes', () => {
  for (const [name, src] of [['Randy', randySource], ['Barry', barrySource]] as const) {
    for (const expr of ['${clipBlock}', '${metricsText}', '${checklistText}', 'coachNotes']) {
      assert.ok(src.includes(expr), `${name} prompt should interpolate ${expr}`)
    }
    assert.doesNotMatch(src, /attached|upload the video/i, `${name} prompt should not imply an attachment`)
  }
  assert.match(routeSource, /formatHittingMetrics\(hittingMetrics\)/)
  assert.match(routeSource, /formatMetrics\(metrics\)/)
})

test('the route loads clip context on the server when a clipId is sent', () => {
  assert.match(routeSource, /loadClipContext\(user\.id, context\.clipId\)/)
  assert.match(routeSource, /if \(!loaded\.ok\) return new Response/)
})

test('AI framing uses the clip toggle, not the player\'s single position', () => {
  assert.match(routeSource, /clipKind = c\.clipKind/)
  assert.match(routeSource, /requestedAgent \?\? \(clipKind === 'hitting' \? 'barry' : 'randy'\)/)
  assert.match(routeSource, /function playerLine\(/)
  assert.match(routeSource, /This clip:/)
  assert.match(routeSource, /playerLine\(playerName, ageGroup, position, clipKind\)/)
  assert.doesNotMatch(routeSource, /isPitcherPosition|player\.position === 'hitter'/)
})

test('formatMetrics shows axis as clock tilt plus degrees, and the newer columns', () => {
  const text = formatMetrics([
    { pitch_type: 'Fastball', velocity: 84.3, spin_rate: 2310, spin_axis: 37.5, horizontal_break: -2.1, vertical_break: 14.8, extension: 6.1, vaa: -5.2 },
    { pitch_type: 'Curveball', velocity: 70, spin_rate: 2450, spin_axis: 202.5, horizontal_break: 6, vertical_break: -9.5 },
  ])
  assert.match(text, /Pitch: Fastball \| Velo: 84\.3 mph \| Spin: 2310 rpm \| Axis: 1:15 tilt \(37\.5° clockwise from 12:00\)/)
  assert.match(text, /IVB: 14\.8" \| Ext: 6\.1 ft \| VAA: -5\.2°/)
  assert.match(text, /Axis: 6:45 tilt/)
  assert.equal(formatMetrics([]), 'No pitch metrics uploaded for this session.')
})

test('formatMetrics caps very long sessions', () => {
  const many = Array.from({ length: MAX_PROMPT_METRICS + 5 }, () => ({
    pitch_type: 'FB', velocity: 80, spin_rate: null, spin_axis: null, horizontal_break: null, vertical_break: null,
  }))
  assert.match(formatMetrics(many), /\(5 more pitches not shown\)$/)
})

test('formatTimestampNotes sorts by time and flags frames with drawings', () => {
  const text = formatTimestampNotes([
    { time_seconds: 3.24, body: 'Front knee caves at foot strike', has_drawing: true },
    { time_seconds: 1.5, body: 'Good hip load' },
  ])
  const lines = text.split('\n')
  assert.equal(lines[0], '0:01.5 — "Good hip load"')
  assert.match(lines[1], /^0:03\.2 — "Front knee caves at foot strike" \(coach drew on this frame; you can't see the drawing\)$/)
  assert.equal(formatTimestampNotes([]), 'No timestamped notes on this clip yet.')
  assert.equal(formatClipTime(75.25), '1:15.3')
})

test('formatClipDetails describes the clip without implying the model can see media', () => {
  const text = formatClipDetails({
    title: 'Bullpen 9/20', session_date: '2026-09-20', uploaded_at: '2026-09-21T02:10:00Z',
    has_voice_note: true, has_lesson_recording: false, annotation_count: 3,
  })
  assert.match(text, /Title: Bullpen 9\/20/)
  assert.match(text, /Session date: 2026-09-20/)
  assert.match(text, /Coach frame drawings: 3 \(not visible to you\)/)
  assert.match(text, /voice note: recorded \(audio not available to you\)/)
  assert.match(formatClipDetails(null), /No specific clip selected/)
})

test('formatChecklist and cleanCoachNotes', () => {
  const text = formatChecklist([
    { name: 'Lead Leg Brace', rating: 'critical', note: 'Knee buckling' },
    { name: 'Arm Path', rating: null, note: '' },
  ])
  assert.equal(text, 'Lead Leg Brace: ✗ Critical — "Knee buckling"\nArm Path: — Not rated')
  assert.equal(cleanCoachNotes('   '), null)
  assert.equal(cleanCoachNotes(42), null)
  assert.equal(cleanCoachNotes(' Stays closed longer '), 'Stays closed longer')
  assert.match(cleanCoachNotes('x'.repeat(5000))!, /… \[truncated\]$/)
})

test('formatHittingMetrics lists the entered session values and skips empty ones', () => {
  assert.equal(
    formatHittingMetrics({ ev_avg: 88.4, ev_max: 97, launch_angle_avg: 14.25, barrel_rate: null, hard_hit_rate: 42, bat_speed: undefined }),
    'Avg exit velo: 88.4 mph | Max exit velo: 97 mph | Avg launch angle: 14.3° | Hard-hit rate: 42%',
  )
  assert.equal(formatHittingMetrics(null), 'No hitting metrics entered for this session.')
  assert.equal(formatHittingMetrics({}), 'No hitting metrics entered for this session.')
})
