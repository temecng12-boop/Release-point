/**
 * Lesson length (QA-005): never Infinity, NaN, 0 or a negative on screen; the
 * seek-to-end trick for MediaRecorder webm files; late durationchange.
 * Run with: npx tsx --test src/lib/__tests__/media-duration.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finiteDuration, formatClock, lessonLengthSeconds, watchMediaDuration, type MediaLike } from '../media-duration'

const BAD = [Infinity, -Infinity, NaN, 0, -0, -1, -0.001, '5', null, undefined, {}]

test('finiteDuration: only finite positive numbers', () => {
  for (const v of BAD) assert.equal(finiteDuration(v), null, String(v))
  assert.equal(finiteDuration(9.5), 9.5)
  assert.equal(finiteDuration(0.04), 0.04)
})

test('formatClock: m:ss for real lengths, --:-- otherwise', () => {
  for (const v of BAD) assert.equal(formatClock(v), '--:--', String(v))
  assert.equal(formatClock(9.4), '0:09')
  assert.equal(formatClock(9.6), '0:10')
  assert.equal(formatClock(65), '1:05')
  assert.equal(formatClock(750), '12:30')
  assert.equal(formatClock(3600), '60:00')
  assert.equal(formatClock(0.3), '0:01', 'a real but short recording is not shown as 0:00')
  for (const v of [...BAD, 0.3, 9.4, 65, 1e9]) assert.doesNotMatch(formatClock(v), /Infinity|NaN|-\d/)
})

test('lessonLengthSeconds: time measured while recording first, then the media duration', () => {
  assert.equal(lessonLengthSeconds(8.2, 8.0), 8.2)
  assert.equal(lessonLengthSeconds(null, 8.0), 8.0)
  assert.equal(lessonLengthSeconds(-3, 8.0), 8.0, 'a negative measurement is ignored')
  assert.equal(lessonLengthSeconds(NaN, Infinity), null)
  assert.equal(lessonLengthSeconds(0, 0), null)
  assert.equal(formatClock(lessonLengthSeconds(null, Infinity)), '--:--')
})

// Stand-in media element. Setting currentTime records the seek; the test then
// fires events the way the browser would.
class FakeMedia implements MediaLike {
  duration: number
  private t = 0
  seeks: number[] = []
  listeners = new Map<string, Set<() => void>>()
  constructor(duration: number) { this.duration = duration }
  get currentTime() { return this.t }
  set currentTime(v: number) { this.seeks.push(v); this.t = Math.min(v, Number.isFinite(this.duration) ? this.duration : v) }
  addEventListener(type: string, fn: () => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(fn) }
  removeEventListener(type: string, fn: () => void) { this.listeners.get(type)?.delete(fn) }
  fire(type: string) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn() }
  count() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0) }
}

function fakeTimers() {
  const pending = new Map<number, () => void>(); let id = 0
  return {
    setTimer: (fn: () => void) => { pending.set(++id, fn); return id },
    clearTimer: (i: never) => { pending.delete(i as unknown as number) },
    runAll: () => { for (const [k, fn] of [...pending]) { pending.delete(k); fn() } },
    pending,
  }
}

function watch(el: FakeMedia, timers = fakeTimers()) {
  const seen: (number | null)[] = []
  const stop = watchMediaDuration(el, d => seen.push(d), timers)
  const valid = () => seen.every(d => d === null || (Number.isFinite(d) && d > 0))
  return { seen, stop, timers, valid }
}

test('finite duration (e.g. Safari mp4): reported at once, no seek', () => {
  const el = new FakeMedia(12.5)
  const w = watch(el)
  assert.deepEqual(w.seen, [12.5])
  assert.deepEqual(el.seeks, [])
  assert.equal(w.timers.pending.size, 0)
})

test('Infinity (Chrome MediaRecorder webm): seeks past the end, reports the real length, goes back to 0', () => {
  const el = new FakeMedia(Infinity)
  const w = watch(el)
  assert.deepEqual(w.seen, [null], 'unknown until the browser works it out')
  assert.deepEqual(el.seeks, [1e101])
  el.duration = 8.36; el.fire('durationchange')
  assert.deepEqual(w.seen, [null, 8.36])
  assert.deepEqual(el.seeks, [1e101, 0], 'back to the start')
  assert.equal(el.currentTime, 0)
  assert.equal(w.timers.pending.size, 0, 'timeout cleared')
  assert.ok(w.valid())
})

test('Infinity, length found on timeupdate instead of durationchange', () => {
  const el = new FakeMedia(Infinity)
  const w = watch(el)
  el.duration = 4; el.fire('timeupdate')
  assert.deepEqual(w.seen, [null, 4])
  assert.deepEqual(el.seeks, [1e101, 0])
  const before = w.seen.length
  el.fire('timeupdate')
  assert.equal(w.seen.length, before, 'timeupdate is only watched during the seek')
})

test('NaN before metadata, then Infinity on loadedmetadata: the seek starts then', () => {
  const el = new FakeMedia(NaN)
  const w = watch(el)
  assert.deepEqual(w.seen, [null])
  assert.deepEqual(el.seeks, [], 'no seek while metadata is missing')
  el.duration = Infinity; el.fire('loadedmetadata')
  assert.deepEqual(el.seeks, [1e101])
  el.duration = 6; el.fire('durationchange')
  assert.deepEqual(w.seen, [null, null, 6])
  assert.ok(w.valid())
})

test('late durationchange: a later, corrected length replaces the first one', () => {
  const el = new FakeMedia(8)
  const w = watch(el)
  el.duration = 9.2; el.fire('durationchange')
  assert.deepEqual(w.seen, [8, 9.2])
  el.duration = NaN; el.fire('durationchange')
  assert.deepEqual(w.seen, [8, 9.2, null], 'goes back to unknown, never NaN')
  assert.deepEqual(el.seeks, [])
})

test('seek trick gives nothing: after the timeout, playback goes back to the start and the length stays unknown', () => {
  const el = new FakeMedia(Infinity)
  const w = watch(el)
  w.timers.runAll()
  assert.deepEqual(el.seeks, [1e101, 0])
  assert.deepEqual(w.seen, [null])
  el.duration = Infinity; el.fire('durationchange')
  assert.deepEqual(el.seeks, [1e101, 0], 'the seek is tried only once')
  el.duration = 7; el.fire('durationchange')
  assert.equal(w.seen.at(-1), 7, 'a length that arrives later still shows')
  assert.ok(w.valid())
})

test('playback position before the seek is restored', () => {
  const el = new FakeMedia(NaN)
  const w = watch(el)
  el.currentTime = 2.5; el.seeks = []
  el.duration = Infinity; el.fire('durationchange')
  el.duration = 10; el.fire('durationchange')
  assert.deepEqual(el.seeks, [1e101, 2.5])
  assert.ok(w.valid())
})

test('cleanup removes every listener and the timer', () => {
  const el = new FakeMedia(Infinity)
  const w = watch(el)
  assert.ok(el.count() > 0)
  w.stop()
  assert.equal(el.count(), 0)
  assert.equal(w.timers.pending.size, 0)
  el.duration = 5; el.fire('durationchange')
  assert.deepEqual(w.seen, [null], 'nothing reported after cleanup')
})

test('lesson list: the lesson player goes through the watcher (video-player only records)', async () => {
  const { readFileSync } = await import('node:fs')
  const list = readFileSync(new URL('../../components/lessons/lesson-list.tsx', import.meta.url), 'utf8')
  assert.match(list, /watchMediaDuration\(v, setMediaSec\)/)
  assert.match(list, /<video ref=\{videoRef\} src=\{url\} controls autoPlay playsInline className/)
  assert.match(list, /lessonRowDuration\(lesson\.duration_ms, mediaSec, open && !!url\)/)
  assert.doesNotMatch(list, /fixInfiniteDuration|1e101/, 'no second, timeout-less seek-to-end')
})
