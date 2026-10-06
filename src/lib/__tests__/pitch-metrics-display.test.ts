/**
 * Pitching metrics tiles: empty vs filled, Axis clock face, no invented demo numbers.
 * Run with: npx tsx --test src/lib/__tests__/pitch-metrics-display.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pitchMetricTiles, pitchMetricsEmpty } from '../pitch-metrics-display'

test('empty row / null → six tiles, every value null, empty helper true', () => {
  for (const row of [null, undefined, {
    velocity: null, spin_rate: null, spin_axis: null,
    vertical_break: null, horizontal_break: null, extension: null,
  }]) {
    const tiles = pitchMetricTiles(row)
    assert.equal(tiles.length, 6)
    assert.deepEqual(tiles.map(t => t.label), ['Velo', 'Spin', 'IVB', 'H-Break', 'Ext', 'Axis'])
    assert.ok(tiles.every(t => t.value == null))
    assert.equal(pitchMetricsEmpty(tiles), true)
  }
  assert.equal(pitchMetricTiles(null).find(t => t.key === 'spin_axis')?.subtitle, 'tilt')
})

test('filled row → big-number strings, units, accents; Axis as clock face', () => {
  const tiles = pitchMetricTiles({
    velocity: 93.0,
    spin_rate: 2240,
    spin_axis: 37.5, // 1:15
    vertical_break: 18.2,
    horizontal_break: 9.0,
    extension: 6.3,
  })
  assert.equal(pitchMetricsEmpty(tiles), false)
  const by = Object.fromEntries(tiles.map(t => [t.key, t]))
  assert.equal(by.velocity.value, '93.0'); assert.equal(by.velocity.unit, 'mph')
  assert.equal(by.spin_rate.value, '2,240'); assert.equal(by.spin_rate.unit, 'rpm')
  assert.equal(by.vertical_break.value, '+18.2'); assert.equal(by.vertical_break.unit, 'in')
  assert.equal(by.horizontal_break.value, '+9.0')
  assert.equal(by.extension.value, '6.3'); assert.equal(by.extension.unit, 'ft')
  assert.equal(by.spin_axis.value, '1:15'); assert.equal(by.spin_axis.unit, '')
  assert.equal(by.spin_axis.subtitle, 'tilt')
  // Negative breaks keep the sign, no forced plus.
  assert.equal(pitchMetricTiles({
    velocity: null, spin_rate: null, spin_axis: null,
    vertical_break: -2.5, horizontal_break: -4, extension: null,
  }).find(t => t.key === 'vertical_break')!.value, '-2.5')
})

test('partial row: only provided fields fill; never invents 93 mph demo numbers', () => {
  const tiles = pitchMetricTiles({
    velocity: 88.6, spin_rate: null, spin_axis: null,
    vertical_break: null, horizontal_break: null, extension: null,
  })
  assert.equal(tiles.find(t => t.key === 'velocity')!.value, '88.6')
  assert.ok(tiles.filter(t => t.key !== 'velocity').every(t => t.value == null))
  assert.equal(pitchMetricsEmpty(tiles), false)
  const src = JSON.stringify(tiles)
  assert.doesNotMatch(src, /93\.0|2240|18\.2|6\.3/)
})

test('metrics tab UI: six-tile primary view, no TrackMan label, import still honest', () => {
  const tab = readFileSync(new URL('../../app/clips/[id]/metrics-tab.tsx', import.meta.url), 'utf8')
  const tiles = readFileSync(new URL('../../app/clips/[id]/pitch-metrics-tiles.tsx', import.meta.url), 'utf8')
  assert.match(tab, /PitchMetricsTiles/)
  assert.match(tiles, /aria-label="Pitch metrics"/)
  assert.match(tiles, /data-empty=\{t\.value == null \? 'true' : 'false'\}/)
  // parseTrackmanPDF is the server action name — fine. No user-facing TrackMan copy.
  const ui = tab.split('\n').filter(l => !l.includes('parseTrackmanPDF')).join('\n')
  assert.doesNotMatch(ui, /[Tt]rack\s?[Mm]an/)
  assert.doesNotMatch(tiles, /[Tt]rack\s?[Mm]an/)
  assert.match(tab, /Add pitch data/)
  assert.match(tab, /Manual entry, or a CSV \/ PDF from your pitch tracker/)
  assert.match(tab, /Spreadsheet/)
  assert.match(tab, /Pitch report/)
  assert.doesNotMatch(ui, /Compatible with TrackMan|Works with TrackMan|TrackMan report/)
  // Empty hint is honest — no "upload TrackMan" and no fake numbers in the component.
  assert.match(tab, /No data yet/)
  assert.doesNotMatch(tiles, /93|2240|18\.2/)
})
