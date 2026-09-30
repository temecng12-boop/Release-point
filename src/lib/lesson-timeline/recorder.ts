// Captures a coach's actions as a v2 timeline while the lesson audio records.
// Pure apart from the injected clock: `now()` must share a timebase with the
// audio start stamp passed to setOrigin() (performance.now() and the
// MediaRecorder "start" event's timeStamp do).
import { FULL_CROP, MAX_TIMELINE_BYTES, TIMELINE_VERSION, timelineBytes, validateTimeline, type Crop, type Offsets, type Pt, type ShapeKind, type TShape, type Timeline, type TimelineEvent, type TimelineStart } from './schema'

export type PxPoint = { x: number; y: number }
/** A mark in canvas pixels (the clip player's own shape format). */
export type PxShape = { type: string; color: string; points?: PxPoint[]; start?: PxPoint; end?: PxPoint }

const POS_EVERY_MS = 1000
const TRACK_EVERY_MS = 250
const TRACK_MIN_DELTA = 0.002
const round4 = (n: number) => Math.round(n * 10000) / 10000
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))
const KINDS: ShapeKind[] = ['freehand', 'line', 'rect', 'circle']

/** Ramer–Douglas–Peucker on normalized points. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2 || eps <= 0) return pts
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
    let best = -1, bestD = 0
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > bestD) { bestD = d; best = i }
    }
    if (best > 0 && bestD > eps) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

export class TimelineRecorder {
  private origin: number | null = null
  private readonly pending: number
  private events: TimelineEvent[] = []
  private start: TimelineStart | null = null
  private lastPos = -Infinity
  private lastTrack = -Infinity
  private lastOffsets: Offsets = {}
  private lastCrop: Crop = FULL_CROP

  constructor(private readonly now: () => number, readonly w: number, readonly h: number, readonly clipDurMs: number | null = null, readonly eps = 0.0015) {
    this.pending = now()
  }

  /** Audio actually started (MediaRecorder "start" event time). Earlier events clamp to 0. */
  setOrigin(ms: number) { this.origin = ms }
  /** Lesson time now (ms from audio start). */
  t(at: number = this.now()): number { return Math.max(0, Math.round(at - (this.origin ?? this.pending))) }

  norm(p: PxPoint): Pt { return [round4(clamp01(p.x / this.w)), round4(clamp01(p.y / this.h))] }
  normShape(id: string, s: PxShape): TShape | null {
    const kind = s.type as ShapeKind
    if (!KINDS.includes(kind)) return null
    const color = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color.toUpperCase() : '#E9412F'
    if (kind === 'freehand') {
      const pts = simplify((s.points ?? []).map(p => this.norm(p)), this.eps).slice(0, 4000)
      return pts.length ? { id, kind, color, pts } : null
    }
    if (!s.start || !s.end) return null
    return { id, kind, color, pts: [this.norm(s.start), this.norm(s.end)] }
  }
  private normOffsets(o: Record<string, PxPoint>): Offsets {
    const out: Offsets = {}
    for (const [id, d] of Object.entries(o)) out[id] = [round4(Math.max(-1, Math.min(1, d.x / this.w))), round4(Math.max(-1, Math.min(1, d.y / this.h)))]
    return out
  }

  /** What the screen showed when recording began. */
  begin(s: { videoSec: number; playing: boolean; rate: number; crop: Crop; shapes: { id: string; shape: PxShape }[]; offsets?: Record<string, PxPoint> }) {
    this.lastCrop = s.crop
    this.lastOffsets = this.normOffsets(s.offsets ?? {})
    this.start = {
      v: Math.max(0, Math.round(s.videoSec * 1000)), playing: s.playing, rate: s.rate, crop: s.crop,
      shapes: s.shapes.map(x => this.normShape(x.id, x.shape)).filter((x): x is TShape => !!x),
      o: { ...this.lastOffsets },
    }
  }

  private push(e: TimelineEvent) { this.events.push(e) }
  private v(sec: number) { return Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) * 1000)) }

  play(videoSec: number)  { const t = this.t(); this.lastPos = t; this.push({ t, k: 'play', v: this.v(videoSec) }) }
  pause(videoSec: number) { this.push({ t: this.t(), k: 'pause', v: this.v(videoSec) }) }
  seek(videoSec: number, step = false) { this.push({ t: this.t(), k: step ? 'step' : 'seek', v: this.v(videoSec) }) }
  rate(r: number) { if (r >= 0.0625 && r <= 16) this.push({ t: this.t(), k: 'rate', r }) }
  /** Call often while the clip plays; stored about once a second (covers buffering stalls). */
  pos(videoSec: number) {
    const t = this.t()
    if (t - this.lastPos < POS_EVERY_MS) return
    this.lastPos = t
    this.push({ t, k: 'pos', v: this.v(videoSec) })
  }
  crop(c: Crop) {
    const r = { l: round4(clamp01(c.l)), t: round4(clamp01(c.t)), r: round4(clamp01(c.r)), b: round4(clamp01(c.b)) }
    if (r.l >= r.r || r.t >= r.b) return
    const p = this.lastCrop
    if (p.l === r.l && p.t === r.t && p.r === r.r && p.b === r.b) return
    this.lastCrop = r
    this.push({ t: this.t(), k: 'crop', c: r })
  }
  /** Pen down: returns the lesson time to pass to stroke(). */
  penDown(): number { return this.t() }
  stroke(id: string, s: PxShape, penDownT: number) {
    const shape = this.normShape(id, s)
    if (!shape) return
    const end = this.t()
    this.push({ t: Math.min(penDownT, end), k: 'stroke', s: shape, d: Math.max(0, end - penDownT) })
  }
  remove(id: string, why: 'undo' | 'delete') { this.push({ t: this.t(), k: 'remove', id, why }); const o = { ...this.lastOffsets }; delete o[id]; this.lastOffsets = o }
  clear() { this.push({ t: this.t(), k: 'clear' }); this.lastOffsets = {} }
  /** Tracked marks' offsets in pixels; stored at most 4x a second and only when they moved. */
  track(offsets: Record<string, PxPoint>) {
    const t = this.t()
    if (t - this.lastTrack < TRACK_EVERY_MS) return
    const n = this.normOffsets(offsets)
    const changed: Offsets = {}
    for (const [id, d] of Object.entries(n)) {
      const p = this.lastOffsets[id] ?? [0, 0]
      if (Math.abs(p[0] - d[0]) >= TRACK_MIN_DELTA || Math.abs(p[1] - d[1]) >= TRACK_MIN_DELTA) changed[id] = d
    }
    if (!Object.keys(changed).length) return
    this.lastTrack = t
    this.lastOffsets = { ...this.lastOffsets, ...changed }
    this.push({ t, k: 'track', o: changed })
  }

  /** Final timeline: sorted, validated and within the size limit (thins tracking/position samples if needed). */
  finish(durationMs: number, maxBytes = MAX_TIMELINE_BYTES): { ok: true; timeline: Timeline } | { ok: false; error: string } {
    if (!this.start) return { ok: false, error: 'Recording never started' }
    const dur = Math.max(0, Math.round(durationMs))
    const events = this.events
      .map((e, i) => ({ e: { ...e, t: Math.min(e.t, dur) } as TimelineEvent, i }))
      .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
      .map(x => x.e)
    let tl: Timeline = { v: TIMELINE_VERSION, durationMs: dur, clip: { w: this.w, h: this.h, durMs: this.clipDurMs }, start: this.start, events }
    for (let pass = 0; pass < 6 && timelineBytes(tl) > maxBytes; pass++) {
      // Drop every other tracking/position sample, then coarsen strokes.
      let n = 0
      const thinned = tl.events.filter(e => (e.k === 'track' || e.k === 'pos') ? (n++ % 2 === 0) : true)
      const eps = this.eps * 2 ** (pass + 1)
      tl = { ...tl, events: pass < 3 ? thinned : thinned.map(e => e.k === 'stroke' && e.s.kind === 'freehand' ? { ...e, s: { ...e.s, pts: simplify(e.s.pts, eps) } } : e) }
    }
    if (timelineBytes(tl) > maxBytes) return { ok: false, error: 'This lesson has too much markup to save. Try a shorter recording.' }
    const checked = validateTimeline(tl)
    return checked.ok ? { ok: true, timeline: checked.timeline } : checked
  }
}

/** Audio-only recording format: mp4/AAC first (iPhone Safari), then webm/opus; null = unsupported. */
export function pickAudioMime(isTypeSupported: (m: string) => boolean): string | null {
  for (const m of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    try { if (isTypeSupported(m)) return m } catch { /* keep looking */ }
  }
  return null
}
