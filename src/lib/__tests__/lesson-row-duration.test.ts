/**
 * Lesson rows (QA-005): stored duration_ms first; older lessons without it
 * use the player's duration, found with the seek-to-end trick, which gives up
 * after 5 s. Never Infinity, NaN, 0 or a negative.
 * Run with: npx tsx --test src/lib/__tests__/lesson-row-duration.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lessonRowDuration } from '../lessons'
import { watchMediaDuration, formatClock, type MediaLike } from '../media-duration'

test('stored duration_ms wins over the media duration', () => {
  assert.equal(lessonRowDuration(9_400, 3, true), '0:09')
  assert.equal(lessonRowDuration(65_000, null, false), '1:05')
})

test('older lesson with no duration_ms: nothing while closed, --:-- while the player works it out, then the media length', () => {
  assert.equal(lessonRowDuration(null, null, false), null)
  assert.equal(lessonRowDuration(undefined, null, false), null)
  assert.equal(lessonRowDuration(null, null, true), '--:--')
  assert.equal(lessonRowDuration(null, Infinity, true), '--:--')
  assert.equal(lessonRowDuration(null, NaN, true), '--:--')
  assert.equal(lessonRowDuration(null, 8.4, true), '0:08')
  assert.equal(lessonRowDuration(null, 8.4, false), '0:08')
})

test('a stored 0, negative or non-finite duration_ms counts as missing', () => {
  for (const bad of [0, -5, NaN, Infinity]) {
    assert.equal(lessonRowDuration(bad, null, false), null, String(bad))
    assert.equal(lessonRowDuration(bad, 4, true), '0:04', String(bad))
  }
})

test('never Infinity, NaN or a negative', () => {
  for (const s of [null, 0, -1, NaN, Infinity, 1234]) for (const m of [null, 0, -1, NaN, Infinity, 7]) for (const o of [true, false]) {
    const r = lessonRowDuration(s as number | null, m as number | null, o)
    assert.ok(r === null || /^\d+:\d\d$|^--:--$/.test(r), `${s} ${m} ${o} -> ${r}`)
  }
})

// An older webm lesson whose length the browser never works out.
class StuckMedia implements MediaLike {
  duration = Infinity
  private t = 0
  seeks: number[] = []
  listeners = new Map<string, Set<() => void>>()
  get currentTime() { return this.t }
  set currentTime(v: number) { this.seeks.push(v); this.t = v }
  addEventListener(type: string, fn: () => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(fn) }
  removeEventListener(type: string, fn: () => void) { this.listeners.get(type)?.delete(fn) }
  fire(type: string) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn() }
}

test('timeout: after 5 s without a length, playback goes back to where it was and the row shows --:--', () => {
  const el = new StuckMedia()
  el.currentTime = 1.5; el.seeks = []   // autoplay already started
  const timers: { fn: () => void; ms: number }[] = []
  const seen: (number | null)[] = []
  const stop = watchMediaDuration(el, d => seen.push(d), {
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimer: () => {},
  })
  assert.deepEqual(el.seeks, [1e101])
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 5000, 'gives up after 5 s')
  el.fire('timeupdate')                  // still Infinity
  timers[0].fn()                         // 5 s pass
  assert.deepEqual(el.seeks, [1e101, 1.5], 'back to where playback was')
  assert.equal(lessonRowDuration(null, seen.at(-1) ?? null, true), '--:--')
  el.fire('durationchange')
  assert.deepEqual(el.seeks, [1e101, 1.5], 'not tried again')
  el.duration = 6.2; el.fire('durationchange')
  assert.equal(lessonRowDuration(null, seen.at(-1) ?? null, true), '0:06', 'a length that arrives later still shows')
  stop()
  assert.equal(formatClock(seen.at(-1)), '0:06')
})
