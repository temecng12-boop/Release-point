// Text blocks for the AI Coach system prompt (src/app/api/ai-chat/route.ts).
// Pure functions, no I/O, so they can be unit tested.
import { degreesToClock } from '@/lib/spin-axis'

export type CoachMetric = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
  extension?: number | null
  vaa?: number | null
}

// clips.hitting_metrics (017), one summary per session. Same keys as the
// hitting metrics tab.
export type CoachHittingMetrics = {
  ev_avg?: number | null
  ev_max?: number | null
  launch_angle_avg?: number | null
  barrel_rate?: number | null
  hard_hit_rate?: number | null
  sweet_spot_rate?: number | null
  attack_angle?: number | null
  bat_speed?: number | null
}

export type CoachPhaseRow = {
  name: string
  rating: 'good' | 'needs_work' | 'critical' | null
  note: string
}

export type CoachTimestampNote = {
  time_seconds: number
  body: string
  has_drawing?: boolean
}

export type CoachClipDetails = {
  title: string | null
  session_date: string | null
  uploaded_at: string | null
  has_voice_note: boolean
  has_lesson_recording: boolean
  annotation_count: number
}

export const MAX_PROMPT_METRICS = 60
export const MAX_PROMPT_TIMESTAMP_NOTES = 60
export const MAX_PROMPT_NOTE_CHARS = 4000

/**
 * The model only ever receives text. Say so up front so it doesn't answer
 * "I don't see a video clip attached" when a coach asks about "this clip".
 */
export const VIDEO_ACCESS_NOTE = `WHAT YOU CAN AND CAN'T SEE:
- You cannot watch, play or see the video, its frames, the coach's drawings, or hear voice notes. No file is ever attached to these messages, so never ask for an upload and never say a video or attachment is missing.
- What you do get is the text below: the clip details, the coach's written notes and timestamped notes, the checklist, and the session metrics for this clip.
- When the coach asks about "this clip" or "this video", analyze it from those notes and metrics, and say plainly and briefly that you're working from the coach's notes and data, not the footage.
- If there's too little to go on, say what's missing (for example "there are no timestamped notes or checklist ratings yet") and suggest what the coach could note while watching.`

function trimText(text: string, max = MAX_PROMPT_NOTE_CHARS): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}… [truncated]` : t
}

function fmtNum(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

/** "0:03.2" style timestamps. */
export function formatClipTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = (s - m * 60).toFixed(1).padStart(4, '0')
  return `${m}:${rest}`
}

export function formatMetrics(metrics: CoachMetric[]): string {
  if (!metrics.length) return 'No pitch metrics uploaded for this session.'
  const rows = metrics.slice(0, MAX_PROMPT_METRICS).map(m => {
    const parts: string[] = []
    if (m.pitch_type) parts.push(`Pitch: ${m.pitch_type}`)
    if (m.velocity != null) parts.push(`Velo: ${fmtNum(Number(m.velocity))} mph`)
    if (m.spin_rate != null) parts.push(`Spin: ${Math.round(Number(m.spin_rate))} rpm`)
    if (m.spin_axis != null) parts.push(`Axis: ${degreesToClock(Number(m.spin_axis))} tilt (${fmtNum(Number(m.spin_axis))}° clockwise from 12:00)`)
    if (m.horizontal_break != null) parts.push(`HB: ${fmtNum(Number(m.horizontal_break))}"`)
    if (m.vertical_break != null) parts.push(`IVB: ${fmtNum(Number(m.vertical_break))}"`)
    if (m.extension != null) parts.push(`Ext: ${fmtNum(Number(m.extension))} ft`)
    if (m.vaa != null) parts.push(`VAA: ${fmtNum(Number(m.vaa))}°`)
    return parts.length ? parts.join(' | ') : 'Pitch with no recorded values'
  })
  if (metrics.length > MAX_PROMPT_METRICS) rows.push(`(${metrics.length - MAX_PROMPT_METRICS} more pitches not shown)`)
  return rows.join('\n')
}

const HITTING_FIELDS: [keyof CoachHittingMetrics, string, string][] = [
  ['ev_avg', 'Avg exit velo', ' mph'],
  ['ev_max', 'Max exit velo', ' mph'],
  ['launch_angle_avg', 'Avg launch angle', '°'],
  ['barrel_rate', 'Barrel rate', '%'],
  ['hard_hit_rate', 'Hard-hit rate', '%'],
  ['sweet_spot_rate', 'Sweet-spot rate', '%'],
  ['attack_angle', 'Attack angle', '°'],
  ['bat_speed', 'Bat speed', ' mph'],
]

export function formatHittingMetrics(hitting: CoachHittingMetrics | null): string {
  const parts = HITTING_FIELDS
    .filter(([key]) => hitting?.[key] != null && Number.isFinite(Number(hitting[key])))
    .map(([key, label, unit]) => `${label}: ${fmtNum(Number(hitting![key]))}${unit}`)
  return parts.length ? parts.join(' | ') : 'No hitting metrics entered for this session.'
}

export function formatChecklist(checklist: CoachPhaseRow[] | null): string {
  if (!checklist || checklist.length === 0) return 'No mechanics checklist completed for this clip.'
  const ratingLabel = { good: '✓ Good', needs_work: '△ Needs Work', critical: '✗ Critical' }
  return checklist.map(row => {
    const rating = row.rating ? ratingLabel[row.rating] : '— Not rated'
    const note = row.note?.trim() ? ` — "${trimText(row.note, 500)}"` : ''
    return `${row.name}: ${rating}${note}`
  }).join('\n')
}

export function formatTimestampNotes(notes: CoachTimestampNote[]): string {
  if (!notes.length) return 'No timestamped notes on this clip yet.'
  const sorted = [...notes].sort((a, b) => a.time_seconds - b.time_seconds).slice(0, MAX_PROMPT_TIMESTAMP_NOTES)
  const rows = sorted.map(n =>
    `${formatClipTime(n.time_seconds)} — "${trimText(n.body, 500)}"${n.has_drawing ? ' (coach drew on this frame; you can\'t see the drawing)' : ''}`)
  if (notes.length > MAX_PROMPT_TIMESTAMP_NOTES) rows.push(`(${notes.length - MAX_PROMPT_TIMESTAMP_NOTES} more notes not shown)`)
  return rows.join('\n')
}

export function formatClipDetails(clip: CoachClipDetails | null): string {
  if (!clip) return 'No specific clip selected (general player conversation).'
  const lines = [
    `- Title: ${clip.title?.trim() || 'Untitled clip'}`,
    `- Session date: ${clip.session_date || 'Not set'}`,
  ]
  if (clip.uploaded_at) lines.push(`- Uploaded: ${clip.uploaded_at.slice(0, 10)}`)
  lines.push(`- Coach frame drawings: ${clip.annotation_count} (not visible to you)`)
  lines.push(`- Coach voice note: ${clip.has_voice_note ? 'recorded (audio not available to you)' : 'none'}`)
  if (clip.has_lesson_recording) lines.push('- Recorded video lesson: yes (not available to you)')
  return lines.join('\n')
}

/** Normalize free text coming from the DB or client before it goes in the prompt. */
export function cleanCoachNotes(notes: unknown): string | null {
  if (typeof notes !== 'string') return null
  const t = notes.trim()
  return t ? trimText(t) : null
}
