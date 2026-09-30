/**
 * Lesson timeline v2: schema, recorder, state at time t, drift correction and seek waiting.
 * Run with: npx tsx --test src/lib/__tests__/lesson-timeline.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTimeline, FULL_CROP, type Timeline, type TimelineEvent } from '../lesson-timeline/schema'
import { TimelineRecorder, simplify, pickAudioMime } from '../lesson-timeline/recorder'
import { applyEvent, buildKeyframes, cropTransform, initialState, stateAt, TimelineCursor, videoAt, visiblePoints } from '../lesson-timeline/state'
import { decideSync, DEFAULT_SYNC, ReplaySync, seekAndWait, type MediaLike, type Timers } from '../lesson-timeline/sync'

const base = (events: TimelineEvent[] = [], extra: Partial<Timeline> = {}): Timeline => ({
  v: 2, durationMs: 60_000, clip: { w: 1920, h: 1080, durMs: 30_000 },
  start: { v: 0, playing: false, rate: 1, crop: FULL_CROP, shapes: [], o: {} }, events, ...extra,
})
const stroke = (t: number, id: string, d = 0): TimelineEvent => ({ t, k: 'stroke', d, s: { id, kind: 'freehand', color: '#E9412F', pts: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4]] } })

// ── schema ────────────────────────────────────────────────────────────────
test('schema: valid timeline passes and unknown keys are dropped', () => {
  const tl = { ...base([{ t: 0, k: 'play', v: 0 }, stroke(500, 's1', 300), { t: 900, k: 'crop', c: { l: 0.2, t: 0.2, r: 0.8, b: 0.8 } }]), extra: 'x' } as unknown
  const r = validateTimeline(tl)
  assert.ok(r.ok)
  assert.equal('extra' in (r as { timeline: object }).timeline, false)
  assert.equal((r as { timeline: Timeline }).timeline.events.length, 3)
})

test('schema: rejects bad version, coordinates, order, colors, kinds, crops and oversize strokes', () => {
  const bad: [string, unknown][] = [
    ['version', { ...base(), v: 1 }],
    ['coord', base([{ ...stroke(0, 's1'), s: { id: 's1', kind: 'freehand', color: '#E9412F', pts: [[1.5, 0]] } } as TimelineEvent])],
    ['order', base([{ t: 500, k: 'pause', v: 0 }, { t: 100, k: 'play', v: 0 }])],
    ['color', base([{ ...stroke(0, 's1'), s: { id: 's1', kind: 'freehand', color: 'red', pts: [[0, 0]] } } as TimelineEvent])],
    ['kind', base([{ t: 0, k: 'explode' } as unknown as TimelineEvent])],
    ['crop', base([{ t: 0, k: 'crop', c: { l: 0.5, t: 0, r: 0.5, b: 1 } }])],
    ['line pts', base([{ t: 0, k: 'stroke', d: 0, s: { id: 'a', kind: 'line', color: '#FFFFFF', pts: [[0, 0]] } }])],
    ['too many pts', base([{ t: 0, k: 'stroke', d: 0, s: { id: 'a', kind: 'freehand', color: '#FFFFFF', pts: Array.from({ length: 4001 }, () => [0, 0]) } } as TimelineEvent])],
    ['time past end', base([{ t: 70_000, k: 'play', v: 0 }])],
    ['id', base([{ t: 0, k: 'remove', id: 'bad id!', why: 'undo' }])],
    ['rate', base([{ t: 0, k: 'rate', r: 0 }])],
    ['not object', 'nope'],
  ]
  for (const [what, tl] of bad) {
    const r = validateTimeline(tl)
    assert.equal(r.ok, false, what)
    assert.match((r as { error: string }).error, /^Invalid lesson timeline/, what)
  }
})

// ── recorder ──────────────────────────────────────────────────────────────
test('recorder: times relative to audio start, normalized coords, simplified strokes, throttled samples', () => {
  let now = 1000
  const rec = new TimelineRecorder(() => now, 1000, 500, 30_000)
  rec.begin({ videoSec: 2, playing: false, rate: 1, crop: FULL_CROP, shapes: [{ id: 's0', shape: { type: 'line', color: '#ffffff', start: { x: 100, y: 50 }, end: { x: 900, y: 450 } } }] })
  rec.setOrigin(1200)                 // audio started 200 ms later
  rec.seek(3)                          // before origin -> t 0
  now = 1700; rec.play(3)              // t 500
  for (let i = 0; i < 30; i++) { now += 100; rec.pos(3 + i / 10) }   // 3 s of samples -> ~3 stored
  now = 5000; const down = rec.penDown()
  const pts = Array.from({ length: 101 }, (_, i) => ({ x: i * 5, y: 100 + i * 2.5 }))   // straight line
  now = 5400; rec.stroke('s1', { type: 'freehand', color: '#E9412F', points: pts }, down)
  now = 5500; rec.track({ s1: { x: 10, y: 0 } }); now = 5600; rec.track({ s1: { x: 20, y: 0 } }); now = 5800; rec.track({ s1: { x: 20.5, y: 0 } }); now = 5900; rec.track({ s1: { x: 20.6, y: 0 } })
  now = 6000; rec.remove('s0', 'undo')
  const r = rec.finish(6000)
  assert.ok(r.ok, !r.ok ? r.error : '')
  const tl = (r as { timeline: Timeline }).timeline
  assert.deepEqual(tl.start.shapes[0].pts, [[0.1, 0.1], [0.9, 0.9]])
  assert.equal(tl.start.v, 2000)
  assert.deepEqual(tl.events[0], { t: 0, k: 'seek', v: 3000 })
  assert.deepEqual(tl.events[1], { t: 500, k: 'play', v: 3000 })
  assert.equal(tl.events.filter(e => e.k === 'pos').length, 3)
  const st = tl.events.find(e => e.k === 'stroke') as Extract<TimelineEvent, { k: 'stroke' }>
  assert.equal(st.t, 3800); assert.equal(st.d, 400)
  assert.equal(st.s.pts.length, 2)                     // straight line simplified to its ends
  assert.deepEqual(tl.events.filter(e => e.k === 'track').map(e => e.t), [4300, 4600])   // 5600 dropped (too soon after 5500)
  assert.ok(validateTimeline(tl).ok)
})

test('recorder: size limit thins samples; simplify keeps corners; audio mime preference', () => {
  let now = 0
  const rec = new TimelineRecorder(() => now, 100, 100)
  rec.begin({ videoSec: 0, playing: true, rate: 1, crop: FULL_CROP, shapes: [] })
  rec.setOrigin(0)
  for (let i = 0; i < 4000; i++) { now += 1000; rec.pos(i) }
  assert.ok(rec.finish(now, 1_000_000).ok)
  const small = rec.finish(now, 60_000)
  assert.ok(small.ok)
  assert.ok((small as { timeline: Timeline }).timeline.events.length < 4000)
  assert.equal(rec.finish(now, 100).ok, false)
  assert.deepEqual(simplify([[0, 0], [0.5, 0.001], [1, 0], [1, 1]], 0.01), [[0, 0], [1, 0], [1, 1]])
  assert.equal(pickAudioMime(m => m.startsWith('audio/mp4')), 'audio/mp4;codecs=mp4a.40.2')
  assert.equal(pickAudioMime(m => m === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus')
  assert.equal(pickAudioMime(() => false), null)
})

test('recorder: scrubbing is thinned to one seek per 40 ms ending at the final spot; frame steps are all kept', () => {
  let now = 0
  const rec = new TimelineRecorder(() => now, 100, 100)
  rec.begin({ videoSec: 0, playing: false, rate: 1, crop: FULL_CROP, shapes: [] }); rec.setOrigin(0)
  for (let i = 0; i < 10; i++) { now += 16; rec.seek(i / 10) }
  now += 500; rec.seek(1, true); now += 10; rec.seek(1.033, true)
  const tl = (rec.finish(1000) as { timeline: Timeline }).timeline
  const seeks = tl.events.filter(e => e.k === 'seek') as { t: number; v: number }[]
  assert.ok(seeks.length <= 4, `seeks ${seeks.length}`)                     // 10 raw seeks thinned
  for (let i = 1; i < seeks.length; i++) assert.ok(seeks[i].t - seeks[i - 1].t >= 40)
  assert.equal(seeks[seeks.length - 1].v, 900)                               // lands where the scrub ended
  assert.deepEqual(tl.events.slice(-2).map(e => e.k), ['step', 'step'])
})

// ── state at time t ───────────────────────────────────────────────────────
const lesson = base([
  { t: 1000, k: 'play', v: 0 },
  { t: 3000, k: 'rate', r: 0.5 },
  { t: 5000, k: 'pause', v: 3000 },
  stroke(6000, 's1', 1000),
  { t: 8000, k: 'track', o: { s1: [0.05, 0] } },
  { t: 9000, k: 'step', v: 3033 },
  { t: 10000, k: 'crop', c: { l: 0.25, t: 0.25, r: 0.75, b: 0.75 } },
  stroke(11000, 's2'),
  { t: 12000, k: 'remove', id: 's2', why: 'undo' },
  { t: 13000, k: 'seek', v: 20000 },
  { t: 14000, k: 'play', v: 20000 },
  { t: 16000, k: 'clear' },
  { t: 25000, k: 'pos', v: 29000 },
])

test('state: video position, speed, strokes, undo, clear, crop and tracking at time t', () => {
  const kf = buildKeyframes(lesson, 5000)
  const at = (t: number) => stateAt(lesson, kf, t).state
  assert.equal(videoAt(at(500), 500), 0)
  assert.equal(videoAt(at(2000), 2000), 1000)
  assert.equal(videoAt(at(4000), 4000), 2500)                // 2 s at 1x + 1 s at 0.5x
  assert.equal(videoAt(at(5500), 5500), 3000)                // paused
  assert.equal(visiblePoints(at(6500).shapes[0], 6500).length, 2)   // half-drawn stroke
  assert.equal(visiblePoints(at(7500).shapes[0], 7500).length, 4)
  assert.deepEqual(at(8500).o, { s1: [0.05, 0] })
  assert.equal(at(9500).jump, 1); assert.equal(videoAt(at(9500), 9500), 3033)
  assert.deepEqual(at(10500).crop, { l: 0.25, t: 0.25, r: 0.75, b: 0.75 })
  assert.deepEqual(at(11500).shapes.map(s => s.s.id), ['s1', 's2'])
  assert.deepEqual(at(12500).shapes.map(s => s.s.id), ['s1'])
  assert.equal(videoAt(at(15000), 15000), 20500)
  assert.deepEqual([at(16500).shapes, at(16500).o], [[], {}])
  assert.equal(videoAt(at(24000), 24000, 30000), 25000)      // still at 0.5x
  assert.equal(videoAt(at(26000), 26000, 30000), 29500)      // periodic position re-anchors
  assert.equal(videoAt(at(40000), 40000, 30000), 30000)      // clamped at clip end
  assert.equal(cropTransform(FULL_CROP, 400, 300), null)
  assert.equal(cropTransform({ l: 0.25, t: 0.25, r: 0.75, b: 0.75 }, 400, 300), 'translate(0px, 0px) scale(2)')
})

test('state: keyframed lookup equals a full replay at every time; cursor rebuilds only on jumps', () => {
  const naive = (t: number) => { const s = initialState(lesson); for (const e of lesson.events) if (e.t <= t) applyEvent(s, e, 30000); return s }
  const kf = buildKeyframes(lesson, 3000)
  for (let t = 0; t <= 30000; t += 137) assert.deepEqual(stateAt(lesson, kf, t).state, naive(t), `t=${t}`)
  const c = new TimelineCursor(lesson, 3000)
  for (let t = 0; t <= 20000; t += 50) assert.deepEqual(c.at(t), naive(t))
  assert.equal(c.rebuilds, 0)                                // playing forward never rebuilds
  assert.deepEqual(c.at(4000), naive(4000))                  // scrub back
  assert.equal(c.rebuilds, 1)
  assert.deepEqual(c.at(25000), naive(25000))                // jump far ahead
  assert.equal(c.rebuilds, 2)
})

// ── drift decision ────────────────────────────────────────────────────────
test('decideSync: dead band, nudge direction and cap, hysteresis, hard seek, iOS missed seeks, paused frames', () => {
  const d = (o: Partial<Parameters<typeof decideSync>[0]>) => decideSync({ driftMs: 0, shouldPlay: true, baseRate: 1, nudging: false, jumped: false, msSinceSeek: 1e9, missedSeeks: 0, ...o })
  assert.deepEqual(d({ driftMs: 80 }), { action: 'none', rate: 1 })
  const ahead = d({ driftMs: 150 }) as { action: string; rate: number }
  assert.equal(ahead.action, 'nudge'); assert.ok(ahead.rate < 1 && ahead.rate >= 0.9)
  const behind = d({ driftMs: -600, baseRate: 2 }) as { rate: number }
  assert.ok(Math.abs(behind.rate - 2 * 1.1) < 1e-9)          // capped at +10%
  assert.equal(d({ driftMs: 50, nudging: true }).action, 'nudge')   // keep nudging until settled
  assert.equal(d({ driftMs: 20, nudging: true }).action, 'none')
  assert.equal(d({ driftMs: 1200 }).action, 'seek')
  assert.equal(d({ driftMs: 1200, msSinceSeek: 500 }).action, 'nudge')       // cooldown after a seek
  assert.equal(d({ driftMs: 1200, missedSeeks: 2 }).action, 'nudge')         // iOS snap: stop re-seeking
  assert.equal(d({ driftMs: 200, jumped: true }).action, 'seek')             // lesson seek -> jump
  assert.equal(d({ driftMs: 60, shouldPlay: false }).action, 'seek')         // paused frame off
  assert.equal(d({ driftMs: 20, shouldPlay: false }).action, 'none')
  assert.equal(d({ driftMs: 33, shouldPlay: false, jumped: true }).action, 'seek')   // one frame step
  assert.equal(d({ driftMs: 60, shouldPlay: false, msSinceSeek: 100 }).action, 'none')
  assert.equal(DEFAULT_SYNC.resyncMs, 120)
})

// ── fake clock media ──────────────────────────────────────────────────────
class Clock implements Timers {
  t = 0
  private q: { at: number; fn: () => void; id: number }[] = []
  private n = 0
  now() { return this.t }
  setTimeout(fn: () => void, ms: number) { const id = ++this.n; this.q.push({ at: this.t + ms, fn, id }); return id }
  clearTimeout(h: unknown) { this.q = this.q.filter(x => x.id !== h) }
  async advance(ms: number, step = 10, each?: () => void) {
    const end = this.t + ms
    while (this.t < end) {
      this.t = Math.min(end, this.t + step)
      for (;;) {
        const due = this.q.filter(x => x.at <= this.t).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        this.q = this.q.filter(x => x !== due); due.fn()
        await new Promise(r => setImmediate(r))
      }
      each?.()
      await new Promise(r => setImmediate(r))
    }
  }
}
class FakeMedia implements MediaLike {
  private pos = 0; private since = 0; private _paused = true
  playbackRate = 1
  seekDelayMs = 0
  snapMs = 0            // iOS-like: seeks while playing land on multiples of this
  clockError = 1        // >1: media runs fast
  seekCount = 0
  private listeners: Record<string, Set<() => void>> = {}
  constructor(private clock: Clock) {}
  private seeking = false
  private sync() { if (!this._paused && !this.seeking) this.pos += (this.clock.t - this.since) * this.playbackRate * this.clockError; this.since = this.clock.t }
  get currentTime() { this.sync(); return this.pos / 1000 }
  set currentTime(s: number) {
    this.sync(); this.seekCount++
    let target = s * 1000
    if (this.snapMs && !this._paused) target = Math.floor(target / this.snapMs) * this.snapMs
    // Like browsers: currentTime reads the target at once; playback resumes after "seeked".
    this.pos = s * 1000; this.seeking = true
    const land = () => { this.sync(); this.pos = target; this.seeking = false; this.emit('seeked') }
    if (this.seekDelayMs) this.clock.setTimeout(land, this.seekDelayMs); else this.clock.setTimeout(land, 0)
  }
  get paused() { return this._paused }
  play() { this.sync(); this._paused = false; return Promise.resolve() }
  pause() { this.sync(); this._paused = true }
  addEventListener(t: string, fn: () => void) { (this.listeners[t] ??= new Set()).add(fn) }
  removeEventListener(t: string, fn: () => void) { this.listeners[t]?.delete(fn) }
  emit(t: string) { for (const fn of [...(this.listeners[t] ?? [])]) fn() }
}
function rig(tl: Timeline, setup: (v: FakeMedia, a: FakeMedia) => void = () => {}) {
  const clock = new Clock(), audio = new FakeMedia(clock), video = new FakeMedia(clock)
  setup(video, audio)
  const sync = new ReplaySync(audio, video, new TimelineCursor(tl), clock, tl.clip.durMs)
  const drift = () => video.currentTime * 1000 - videoAt(new TimelineCursor(tl).at(audio.currentTime * 1000), audio.currentTime * 1000, tl.clip.durMs)
  return { clock, audio, video, sync, drift }
}
const playing = base([], { start: { v: 0, playing: true, rate: 1, crop: FULL_CROP, shapes: [], o: {} } })

test('replay sync: a 3% fast video is pulled back with rate nudges only, no seeks', async () => {
  const r = rig(playing, v => { v.clockError = 1.03 })
  r.sync.play()
  let worst = 0
  await r.clock.advance(20_000, 10, () => { if (r.clock.t % 250 === 0) r.sync.tick(); if (r.clock.t > 3000) worst = Math.max(worst, Math.abs(r.drift())) })
  assert.equal(r.sync.seeks, 0)
  assert.ok(r.sync.nudges > 0)
  assert.ok(worst < 200, `worst drift ${worst}`)
  assert.ok(Math.abs(r.drift()) < 150)
})

test('replay sync: large drift seeks; slow seek holds the audio until "seeked", then resumes', async () => {
  const r = rig(playing, v => { v.seekDelayMs = 800 })
  r.sync.play()
  r.video.currentTime = 5          // someone knocked the video 5 s off
  await r.clock.advance(900)
  const heldAt = r.audio.currentTime
  r.sync.tick()
  assert.equal(r.sync.busy, true)
  await r.clock.advance(300)
  assert.equal(r.audio.paused, true, 'audio held during a slow seek')
  assert.equal(r.audio.currentTime, heldAt + 0.12)
  await r.clock.advance(700)
  assert.equal(r.sync.busy, false)
  assert.equal(r.audio.paused, false, 'audio resumed after seeked')
  assert.equal(r.sync.audioHolds, 1)
  assert.ok(Math.abs(r.drift()) < 150, `drift ${r.drift()}`)
})

test('replay sync: quick seeks do not interrupt the audio; a seek that never finishes times out and resumes', async () => {
  const quick = rig(base([{ t: 1000, k: 'seek', v: 10_000 }], { start: { v: 0, playing: true, rate: 1, crop: FULL_CROP, shapes: [], o: {} } }), v => { v.seekDelayMs = 50 })
  quick.sync.play()
  await quick.clock.advance(3000, 10, () => { if (quick.clock.t % 250 === 0) quick.sync.tick() })
  assert.equal(quick.sync.seeks, 1); assert.equal(quick.sync.audioHolds, 0)
  assert.ok(Math.abs(quick.drift()) < 150)

  const stuck = rig(playing)
  stuck.video.emit = () => {}          // "seeked" never fires
  stuck.sync.play()
  stuck.video.currentTime = 9
  await stuck.clock.advance(20)
  stuck.sync.tick()
  await stuck.clock.advance(1400)
  assert.equal(stuck.audio.paused, true)
  await stuck.clock.advance(200)
  assert.equal(stuck.sync.busy, false, 'timeout fallback ended the wait')
  assert.equal(stuck.audio.paused, false)
})

test('seekAndWait: resolves on seeked, or on timeout', async () => {
  const clock = new Clock(), v = new FakeMedia(clock)
  v.seekDelayMs = 300
  const p = seekAndWait(v, 4, clock, 1000)
  await clock.advance(310)
  assert.equal(await p, 'seeked')
  v.seekDelayMs = 5000
  const q = seekAndWait(v, 1, clock, 1000)
  await clock.advance(1010)
  assert.equal(await q, 'timeout')
})

test('replay sync: iOS-style 1 s seek snapping stops re-seeking after 2 misses and nudges instead', async () => {
  const r = rig(playing, v => { v.snapMs = 1000 })
  r.sync.play()
  await r.clock.advance(100)
  r.video.currentTime = 7.5         // lands on 7.0 while playing: way off
  await r.clock.advance(3400, 10)
  await r.clock.advance(12_000, 10, () => { if (r.clock.t % 250 === 0) r.sync.tick() })
  assert.ok(r.sync.seeks <= 3, `seeks ${r.sync.seeks}`)
  assert.ok(r.sync.nudges > 0)
})

test('replay sync: paused frame steps and user scrubbing move the video to the exact frame', async () => {
  const tl = base([{ t: 500, k: 'step', v: 1033 }, { t: 700, k: 'step', v: 1066 }])
  const r = rig(tl)
  r.sync.play()
  await r.clock.advance(1000, 10, () => { if (r.clock.t % 50 === 0) r.sync.tick() })
  assert.equal(r.video.paused, true)
  assert.ok(Math.abs(r.video.currentTime * 1000 - 1066) < 1, `video at ${r.video.currentTime * 1000}, seeks ${r.sync.seeks}`)
  r.sync.pause()
  r.sync.scrubTo(600)
  await r.clock.advance(50)
  assert.ok(Math.abs(r.video.currentTime * 1000 - 1033) < 1, `scrub: video at ${r.video.currentTime * 1000}`)
})
