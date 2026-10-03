// Lesson timeline, format version 2 (stored in public.lessons.timeline).
//
// A timeline lesson is an audio file (lessons.media_path) plus this JSON. Replay
// draws it over the ORIGINAL clip video, so nothing is re-encoded.
//  - t: milliseconds from the start of the audio recording (audio clock).
//  - Coordinates are normalized to the clip frame (0..1, x by width, y by
//    height), so replay works at any display size.
//  - Video positions (v) are clip-video milliseconds.
// validateTimeline() is used by the server before storing and by the client
// before upload; it returns a cleaned copy (unknown keys dropped).

export const TIMELINE_VERSION = 2
export const MAX_TIMELINE_BYTES = 800_000          // server actions accept ~1 MB bodies
export const MAX_DURATION_MS = 4 * 60 * 60 * 1000  // 4 h
const MAX_EVENTS = 50_000
const MAX_POINTS_PER_STROKE = 4_000
const MAX_TOTAL_POINTS = 200_000
const T_SLACK_MS = 5_000

export type Pt = [number, number]
export type ShapeKind = 'freehand' | 'line' | 'rect' | 'circle'
/** freehand: the stroke's points; line/rect/circle: [start, end]. */
export type TShape = { id: string; kind: ShapeKind; color: string; pts: Pt[] }
/** Visible part of the frame (zoom/reframe), normalized: l < r, t < b. */
export type Crop = { l: number; t: number; r: number; b: number }
export type Offsets = Record<string, Pt>

export type TimelineEvent =
  | { t: number; k: 'play'; v: number }
  | { t: number; k: 'pause'; v: number }
  | { t: number; k: 'seek'; v: number }                 // scrub / jump
  | { t: number; k: 'step'; v: number }                 // frame step
  | { t: number; k: 'rate'; r: number }                 // playback speed
  | { t: number; k: 'pos'; v: number }                  // periodic position while playing
  | { t: number; k: 'crop'; c: Crop }                   // zoom / reframe
  | { t: number; k: 'stroke'; s: TShape; d: number }    // pen down at t, drawn over d ms
  | { t: number; k: 'remove'; id: string; why: 'undo' | 'delete' }
  | { t: number; k: 'clear' }
  | { t: number; k: 'track'; o: Offsets }               // tracked marks' offsets

export type TimelineStart = { v: number; playing: boolean; rate: number; crop: Crop; shapes: TShape[]; o: Offsets }

export type Timeline = {
  v: 2
  durationMs: number
  /** Clip frame size the coach saw (pixels), and the clip length if known. */
  clip: { w: number; h: number; durMs: number | null }
  start: TimelineStart
  events: TimelineEvent[]
}

export const FULL_CROP: Crop = { l: 0, t: 0, r: 1, b: 1 }

export type ValidationResult = { ok: true; timeline: Timeline } | { ok: false; error: string }

class Invalid extends Error {}
const fail = (m: string): never => { throw new Invalid(m) }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
function num(x: unknown, what: string, lo: number, hi: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) fail(`${what} out of range`)
  return x as number
}
const coord = (x: unknown, what: string) => num(x, what, 0, 1)
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const KINDS: ShapeKind[] = ['freehand', 'line', 'rect', 'circle']

function id(x: unknown): string {
  if (typeof x !== 'string' || !ID_RE.test(x)) fail('bad shape id')
  return x as string
}
function pt(x: unknown, what: string): Pt {
  if (!Array.isArray(x) || x.length !== 2) fail(`${what}: bad point`)
  return [coord((x as unknown[])[0], what), coord((x as unknown[])[1], what)]
}
function crop(x: unknown): Crop {
  if (!isObj(x)) fail('bad crop')
  const c = x as Record<string, unknown>
  const out = { l: coord(c.l, 'crop'), t: coord(c.t, 'crop'), r: coord(c.r, 'crop'), b: coord(c.b, 'crop') }
  if (out.l >= out.r || out.t >= out.b) fail('crop is empty')
  return out
}
function offsets(x: unknown): Offsets {
  if (!isObj(x)) fail('bad offsets')
  const out: Offsets = {}
  const entries = Object.entries(x as Record<string, unknown>)
  if (entries.length > 1000) fail('too many offsets')
  for (const [k, v] of entries) {
    if (!Array.isArray(v) || v.length !== 2) fail('bad offset')
    const pair = v as unknown[]
    out[id(k)] = [num(pair[0], 'offset', -1, 1), num(pair[1], 'offset', -1, 1)]
  }
  return out
}
function shape(x: unknown, budget: { points: number }): TShape {
  if (!isObj(x)) fail('bad shape')
  const s = x as Record<string, unknown>
  const kind = s.kind as ShapeKind
  if (!KINDS.includes(kind)) fail('bad shape kind')
  if (typeof s.color !== 'string' || !COLOR_RE.test(s.color)) fail('bad shape color')
  if (!Array.isArray(s.pts) || s.pts.length < 1) fail('shape has no points')
  const pts = s.pts as unknown[]
  if (kind === 'freehand' ? pts.length > MAX_POINTS_PER_STROKE : pts.length !== 2) fail('bad point count')
  budget.points += pts.length
  if (budget.points > MAX_TOTAL_POINTS) fail('too many points')
  return { id: id(s.id), kind, color: (s.color as string).toUpperCase(), pts: pts.map(p => pt(p, 'shape')) }
}

function event(x: unknown, maxT: number, budget: { points: number }): TimelineEvent {
  if (!isObj(x)) fail('bad event')
  const e = x as Record<string, unknown>
  const t = num(e.t, 'event time', 0, maxT)
  const vid = (v: unknown) => num(v, 'video time', 0, MAX_DURATION_MS)
  switch (e.k) {
    case 'play': case 'pause': case 'seek': case 'step': case 'pos':
      return { t, k: e.k, v: vid(e.v) }
    case 'rate': return { t, k: 'rate', r: num(e.r, 'rate', 0.0625, 16) }
    case 'crop': return { t, k: 'crop', c: crop(e.c) }
    case 'stroke': return { t, k: 'stroke', s: shape(e.s, budget), d: num(e.d, 'stroke duration', 0, MAX_DURATION_MS) }
    case 'remove':
      if (e.why !== 'undo' && e.why !== 'delete') fail('bad remove reason')
      return { t, k: 'remove', id: id(e.id), why: e.why as 'undo' | 'delete' }
    case 'clear': return { t, k: 'clear' }
    case 'track': return { t, k: 'track', o: offsets(e.o) }
    default: return fail(`unknown event kind`)
  }
}

export function validateTimeline(input: unknown): ValidationResult {
  try {
    if (!isObj(input)) fail('timeline must be an object')
    const x = input as Record<string, unknown>
    if (x.v !== TIMELINE_VERSION) fail(`unsupported timeline version`)
    const durationMs = num(x.durationMs, 'durationMs', 0, MAX_DURATION_MS)
    if (!isObj(x.clip)) fail('missing clip')
    const c = x.clip as Record<string, unknown>
    const clip = {
      w: num(c.w, 'clip width', 1, 16384), h: num(c.h, 'clip height', 1, 16384),
      durMs: c.durMs == null ? null : num(c.durMs, 'clip duration', 0, MAX_DURATION_MS),
    }
    if (!isObj(x.start)) fail('missing start state')
    const s = x.start as Record<string, unknown>
    const budget = { points: 0 }
    if (!Array.isArray(s.shapes) || s.shapes.length > 1000) fail('bad start shapes')
    if (typeof s.playing !== 'boolean') fail('bad start playing')
    const start: TimelineStart = {
      v: num(s.v, 'start video time', 0, MAX_DURATION_MS),
      playing: s.playing as boolean,
      rate: num(s.rate, 'start rate', 0.0625, 16),
      crop: crop(s.crop),
      shapes: (s.shapes as unknown[]).map(sh => shape(sh, budget)),
      o: s.o == null ? {} : offsets(s.o),
    }
    if (!Array.isArray(x.events)) fail('events must be an array')
    const raw = x.events as unknown[]
    if (raw.length > MAX_EVENTS) fail('too many events')
    const maxT = durationMs + T_SLACK_MS
    const events = raw.map(e => event(e, maxT, budget))
    for (let i = 1; i < events.length; i++) if (events[i].t < events[i - 1].t) fail('events are not in time order')
    return { ok: true, timeline: { v: 2, durationMs, clip, start, events } }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: `Invalid lesson timeline: ${e.message}` }
    throw e
  }
}

export function timelineBytes(tl: Timeline): number {
  return new TextEncoder().encode(JSON.stringify(tl)).length
}
