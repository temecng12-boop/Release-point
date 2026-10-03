/**
 * Recording support messages (QA-004) and recorded length (QA-005/QA-007).
 * Run with: npx tsx --test src/lib/__tests__/lesson-recording.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lessonTotalMs, micErrorMessage, recordedDurationMs, recordingSupportError } from '../lesson-recording'

test('unsupported browsers get a clear message instead of nothing', () => {
  const ok = { isSecureContext: true, hasGetUserMedia: true, hasMediaRecorder: true }
  assert.equal(recordingSupportError(ok), null)
  assert.match(recordingSupportError({ ...ok, hasMediaRecorder: false })!, /isn't supported in this browser/)
  assert.match(recordingSupportError({ ...ok, hasGetUserMedia: false })!, /can't use the microphone/)
  assert.match(recordingSupportError({ ...ok, isSecureContext: false })!, /secure \(https\)/)
})

test('microphone errors are explained', () => {
  assert.match(micErrorMessage({ name: 'NotAllowedError' }), /blocked/)
  assert.match(micErrorMessage({ name: 'NotFoundError' }), /No microphone/)
  assert.match(micErrorMessage({ name: 'NotReadableError' }), /busy/)
  assert.match(micErrorMessage(new Error('x')), /Couldn't start the microphone/)
})

test('recorded length: event times, else the timer; never Infinity/NaN', () => {
  assert.equal(recordedDurationMs(1000.4, 11_250.9, 10), 10_251)
  assert.equal(recordedDurationMs(0, 5000, 7), 7000)          // start never fired -> timer
  assert.equal(recordedDurationMs(null, null, 0), null)
  assert.equal(recordedDurationMs(5000, 4000, 3), 3000)       // clock went backwards -> timer
  assert.equal(recordedDurationMs(1, Infinity, 2), 2000)
})

test('total length for the progress bar: stored duration, then a finite media duration, never 0', () => {
  assert.equal(lessonTotalMs(12_000, Infinity), 12_000)
  assert.equal(lessonTotalMs(null, Infinity, 9_500.4), 9_500)
  assert.equal(lessonTotalMs(0, NaN), null)
})
