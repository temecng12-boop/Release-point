// Rebuilds what the coach's screen looked like at lesson time t (ms of audio):
// clip-video position/play state/speed, zoom, marks (with in-progress strokes)
// and tracking offsets. Keyframes every N seconds keep scrubbing fast.
import type { Crop, Offsets, Pt, TShape, Timeline, TimelineEvent } from './schema'

export type PlacedShape = { s: TShape; t0: number; d: number }
export type ReplayState = {
  /** Clip-video position (ms) at lesson time `at`; advances at `rate` while playing. */
  videoMs: number
  at: number
  playing: boolean
  rate: number
  crop: Crop
  shapes: PlacedShape[]
  o: Offsets
  /** Bumped on every seek/step, so the player knows to jump instead of nudging. */
  jump: number
}

export function initialState(tl: Timeline): ReplayState {
  const s = tl.start
  return {
    videoMs: s.v, at: 0, playing: s.playing, rate: s.rate, crop: { ...s.crop },
    shapes: s.shapes.map(sh => ({ s: sh, t0: 0, d: 0 })), o: { ...s.o }, jump: 0,
  }
}

export function cloneState(s: ReplayState): ReplayState {
  return { ...s, crop: { ...s.crop }, shapes: s.shapes.slice(), o: { ...s.o } }
}

/** Clip-video position (ms) the coach saw at lesson time t. */
export function videoAt(s: ReplayState, t: number, clipDurMs: number | null = null): number {
  const v = s.playing ? s.videoMs + Math.max(0, t - s.at) * s.rate : s.videoMs
  const max = clipDurMs ?? Infinity
  return Math.max(0, Math.min(v, max))
}

/** Applies one event (mutates s). */
export function applyEvent(s: ReplayState, e: TimelineEvent, clipDurMs: number | null = null): void {
  switch (e.k) {
    case 'play':  s.videoMs = e.v; s.at = e.t; s.playing = true; break
    case 'pause': s.videoMs = e.v; s.at = e.t; s.playing = false; break
    case 'seek':
    case 'step':  s.videoMs = e.v; s.at = e.t; s.jump++; break
    case 'pos':   s.videoMs = e.v; s.at = e.t; break
    case 'rate':  s.videoMs = videoAt(s, e.t, clipDurMs); s.at = e.t; s.rate = e.r; break
    case 'crop':  s.crop = { ...e.c }; break
    case 'stroke': s.shapes = [...s.shapes.filter(p => p.s.id !== e.s.id), { s: e.s, t0: e.t, d: e.d }]; break
    case 'remove': {
      s.shapes = s.shapes.filter(p => p.s.id !== e.id)
      if (e.id in s.o) { s.o = { ...s.o }; delete s.o[e.id] }
      break
    }
    case 'clear': s.shapes = []; s.o = {}; break
    case 'track': s.o = { ...s.o, ...e.o }; break
  }
}

export type Keyframe = { t: number; index: number; state: ReplayState }

/** Snapshots every `intervalMs`: state after all events with t <= keyframe t. */
export function buildKeyframes(tl: Timeline, intervalMs = 5000): Keyframe[] {
  const dur = tl.clip.durMs
  const s = initialState(tl)
  const out: Keyframe[] = []
  let i = 0
  const end = Math.max(tl.durationMs, tl.events.length ? tl.events[tl.events.length - 1].t : 0)
  for (let kt = 0; kt <= end; kt += intervalMs) {
    while (i < tl.events.length && tl.events[i].t <= kt) applyEvent(s, tl.events[i++], dur)
    out.push({ t: kt, index: i, state: cloneState(s) })
  }
  return out
}

/** State at t from scratch-free keyframes (pure; returns a new object). */
export function stateAt(tl: Timeline, keyframes: Keyframe[], t: number): { state: ReplayState; index: number } {
  let lo = 0, hi = keyframes.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (keyframes[mid].t <= t) lo = mid; else hi = mid - 1
  }
  const kf = keyframes[lo]
  const s = kf && kf.t <= t ? cloneState(kf.state) : initialState(tl)
  let i = kf && kf.t <= t ? kf.index : 0
  while (i < tl.events.length && tl.events[i].t <= t) applyEvent(s, tl.events[i++], tl.clip.durMs)
  return { state: s, index: i }
}

/**
 * Stateful reader for playback: moves forward event by event while time runs
 * forward, and rebuilds from the nearest keyframe after a jump backwards or far ahead.
 */
export class TimelineCursor {
  readonly keyframes: Keyframe[]
  private s: ReplayState
  private i = 0
  private lastT = 0
  rebuilds = 0
  constructor(readonly tl: Timeline, readonly intervalMs = 5000) {
    this.keyframes = buildKeyframes(tl, intervalMs)
    this.s = initialState(tl)
    this.i = 0
    this.lastT = -1
  }
  at(t: number): ReplayState {
    if (t < this.lastT || t - this.lastT > this.intervalMs) {
      const r = stateAt(this.tl, this.keyframes, t)
      this.s = r.state; this.i = r.index; this.rebuilds++
    } else {
      const ev = this.tl.events
      while (this.i < ev.length && ev[this.i].t <= t) applyEvent(this.s, ev[this.i++], this.tl.clip.durMs)
    }
    this.lastT = t
    return this.s
  }
}

/** Points of a shape visible at time t (a stroke is revealed over its drawing time). */
export function visiblePoints(p: PlacedShape, t: number): Pt[] {
  if (p.d <= 0 || t >= p.t0 + p.d) return p.s.pts
  if (t < p.t0) return []
  const f = (t - p.t0) / p.d
  if (p.s.kind === 'freehand') return p.s.pts.slice(0, Math.max(1, Math.ceil(p.s.pts.length * f)))
  const [a, b] = p.s.pts
  return [a, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]]
}

/** CSS transform for a zoomed view (same math as the clip player's reframe). */
export function cropTransform(c: Crop, W: number, H: number): string | null {
  const cw = c.r - c.l, ch = c.b - c.t
  if ((cw >= 0.999 && ch >= 0.999) || !W || !H) return null
  const z = Math.max(1 / cw, 1 / ch)
  const px = -((c.l + c.r) / 2 - 0.5) * W * z
  const py = -((c.t + c.b) / 2 - 0.5) * H * z
  return `translate(${px}px, ${py}px) scale(${z})`
}
