/**
 * Run with: npx tsx --test src/lib/__tests__/spin-axis.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockToDegrees, degreesToClock, isIntegerSyntaxError, parseClockAxis, parseImportedSpinAxis, roundAxisForIntegerColumn, trackmanSpinAxisToDegrees } from '../spin-axis'

function degreesOf(input: string): number | null {
  const r = parseClockAxis(input)
  assert.ok(r.ok, `expected "${input}" to parse`)
  return r.degrees
}

test('parses clock tilt into degrees clockwise from 12:00', () => {
  assert.equal(degreesOf('12:00'), 0)
  assert.equal(degreesOf('3:00'), 90)
  assert.equal(degreesOf('6:00'), 180)
  assert.equal(degreesOf('9:00'), 270)
  assert.equal(degreesOf('8:45'), 262.5)
  assert.equal(degreesOf('1:15'), 37.5)
  assert.equal(degreesOf('1:00'), 30)
  assert.equal(degreesOf('12:59'), 29.5)
  assert.equal(degreesOf('11:59'), 359.5)
  assert.equal(degreesOf('01:30'), 45)
  assert.equal(degreesOf('  2:07 '), 63.5)
})

test('empty input means no axis', () => {
  assert.deepEqual(parseClockAxis(''), { ok: true, degrees: null })
  assert.deepEqual(parseClockAxis('   '), { ok: true, degrees: null })
  assert.deepEqual(parseClockAxis(null), { ok: true, degrees: null })
  assert.deepEqual(parseClockAxis(undefined), { ok: true, degrees: null })
})

test('rejects values outside 1:00-12:59 and non-clock formats', () => {
  for (const bad of ['0:30', '13:00', '0:00', '8:60', '8:5', '8:450', '845', '8', '8.45', '8:45pm', '-1:00', '22', 'abc', ':45', '8:']) {
    const r = parseClockAxis(bad)
    assert.equal(r.ok, false, `expected "${bad}" to be rejected`)
    if (!r.ok) assert.match(r.error, /1:00 to 12:59/)
  }
})

test('formats degrees back to clock time', () => {
  assert.equal(degreesToClock(0), '12:00')
  assert.equal(degreesToClock(360), '12:00')
  assert.equal(degreesToClock(90), '3:00')
  assert.equal(degreesToClock(180), '6:00')
  assert.equal(degreesToClock(262.5), '8:45')
  assert.equal(degreesToClock(37.5), '1:15')
  assert.equal(degreesToClock(29.5), '12:59')
  assert.equal(degreesToClock(359.5), '11:59')
  assert.equal(degreesToClock(-90), '9:00')
  assert.equal(degreesToClock(359.9), '12:00')
})

test('every minute from 1:00 to 12:59 round-trips exactly', () => {
  for (let h = 1; h <= 12; h++) {
    for (let m = 0; m < 60; m++) {
      const clock = `${h}:${String(m).padStart(2, '0')}`
      const deg = degreesOf(clock)
      assert.equal(deg, clockToDegrees(h, m))
      assert.ok(deg! >= 0 && deg! < 360)
      assert.equal(degreesToClock(deg!), clock)
    }
  }
})

// ── TrackMan import (RP: SpinAxis 180° = 12:00) ──────────────────────────────

test('TrackMan SpinAxis → app degrees at the 4 cardinal points', () => {
  assert.equal(trackmanSpinAxisToDegrees(180), 0)    // 12:00 pure backspin
  assert.equal(trackmanSpinAxisToDegrees(270), 90)   // 3:00
  assert.equal(trackmanSpinAxisToDegrees(0), 180)    // 6:00 pure topspin
  assert.equal(trackmanSpinAxisToDegrees(90), 270)   // 9:00
})

test('TrackMan SpinAxis wraps around 0/360', () => {
  assert.equal(trackmanSpinAxisToDegrees(360), 180)
  assert.equal(trackmanSpinAxisToDegrees(179), 359)
  assert.equal(trackmanSpinAxisToDegrees(181), 1)
  assert.equal(trackmanSpinAxisToDegrees(179.5), 359.5)
  assert.equal(trackmanSpinAxisToDegrees(540), 0)
  assert.equal(trackmanSpinAxisToDegrees(-90), 90)
  assert.equal(trackmanSpinAxisToDegrees(179.999), 0)    // rounds to 360 → 0, never 360
  assert.equal(trackmanSpinAxisToDegrees(Number.NaN), null)
  assert.equal(trackmanSpinAxisToDegrees(Infinity), null)
})

test('TrackMan degrees agree with TrackMan Tilt and with manual clock entry (round trip)', () => {
  // TrackMan Tilt = (SpinAxis − 180) / 30 hours; e.g. SpinAxis 225 ↔ Tilt 1:30
  const cases: [number, string][] = [[180, '12:00'], [270, '3:00'], [0, '6:00'], [90, '9:00'], [225, '1:30'], [215, '1:10'], [247.914355, '2:16'], [135, '10:30']]
  for (const [tm, clock] of cases) {
    const app = trackmanSpinAxisToDegrees(tm)!
    assert.equal(degreesToClock(app), clock, `${tm}° → ${clock}`)
    const manual = parseClockAxis(clock)
    assert.ok(manual.ok)
    if (Number.isInteger(tm)) assert.equal(manual.degrees, app, `manual ${clock} stores the same degrees as TrackMan ${tm}`)
  }
  for (const clock of ['12:00', '3:00', '6:00', '9:00', '1:15', '8:45', '11:59', '12:01']) {
    const r = parseClockAxis(clock)
    assert.ok(r.ok && r.degrees != null)
    assert.equal(degreesToClock(r.degrees), clock)
  }
})

test('imported CSV cells: numbers are TrackMan degrees, clock strings are used as-is', () => {
  assert.equal(parseImportedSpinAxis('180'), 0)
  assert.equal(parseImportedSpinAxis(' 213.4 '), 33.4)
  assert.equal(parseImportedSpinAxis('0'), 180)          // 0 is a real value, not "missing"
  assert.equal(parseImportedSpinAxis('1:15'), 37.5)      // TrackMan Tilt column / clock strings
  assert.equal(parseImportedSpinAxis('12:00'), 0)
  assert.equal(parseImportedSpinAxis('9:00'), 270)
  for (const bad of ['', '  ', null, undefined, 'abc', '13:00', '1:75', '12abc', '1e3x']) assert.equal(parseImportedSpinAxis(bad as string), null, String(bad))
})

test('integer-column fallback helpers', () => {
  assert.equal(isIntegerSyntaxError({ code: '22P02', message: 'invalid input syntax for type integer: "33.4"' }), true)
  assert.equal(isIntegerSyntaxError({ code: '22P02', message: 'invalid input syntax for type uuid' }), false)
  assert.equal(isIntegerSyntaxError(null), false)
  assert.equal(roundAxisForIntegerColumn(33.4), 33)
  assert.equal(roundAxisForIntegerColumn(359.5), 0)
  assert.equal(roundAxisForIntegerColumn(null), null)
})
