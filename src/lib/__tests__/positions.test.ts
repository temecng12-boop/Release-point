/**
 * Multi-select positions: mapping, dual-write, clip default.
 * Run with: npx tsx --test src/lib/__tests__/positions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultClipKind,
  INVALID_POSITIONS,
  legacyPositionFrom,
  mapLegacyPosition,
  parsePositionsInput,
  resolveClipKind,
  resolvePlayerPositions,
  writeWithPositions,
  canRepresentAsLegacyPosition,
  POSITIONS_UNAVAILABLE,
} from '../positions'

test('mapLegacyPosition covers every value the app has written, plus two-way spellings', () => {
  assert.deepEqual(mapLegacyPosition('pitcher'), ['pitcher'])
  assert.deepEqual(mapLegacyPosition('hitter'), ['hitter'])
  assert.deepEqual(mapLegacyPosition('pitcher+hitter'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('Pitcher + Hitter'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('two-way'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('two_way'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('twoway'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('both'), ['two-way'])
  assert.deepEqual(mapLegacyPosition('catcher'), ['catcher'])
  assert.deepEqual(mapLegacyPosition('infield'), ['infield'])
  assert.deepEqual(mapLegacyPosition('infielder'), ['infield'])
  assert.deepEqual(mapLegacyPosition('outfield'), ['outfield'])
  assert.deepEqual(mapLegacyPosition('rhp'), ['pitcher'])
  assert.deepEqual(mapLegacyPosition(null), [])
  assert.deepEqual(mapLegacyPosition(''), [])
  assert.deepEqual(mapLegacyPosition('  '), [])
})

test('parsePositionsInput accepts the six tags, dedupes, refuses unknown', () => {
  assert.deepEqual(parsePositionsInput(['catcher', 'hitter', 'catcher']), { ok: true, positions: ['catcher', 'hitter'] })
  assert.deepEqual(parsePositionsInput([]), { ok: true, positions: [] })
  assert.deepEqual(parsePositionsInput(null), { ok: true, positions: [] })
  const bad = parsePositionsInput(['shortstop'])
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.error, INVALID_POSITIONS)
  assert.equal(parsePositionsInput([1]).ok, false)
})

test('resolvePlayerPositions: positions wins; missing/undefined falls back to the old column; empty is valid', () => {
  assert.deepEqual(resolvePlayerPositions({ positions: ['catcher', 'infield'], position: 'pitcher' }), ['catcher', 'infield'])
  assert.deepEqual(resolvePlayerPositions({ position: 'hitter' }), ['hitter'])
  assert.deepEqual(resolvePlayerPositions({ positions: undefined, position: 'pitcher+hitter' }), ['two-way'])
  assert.deepEqual(resolvePlayerPositions({ positions: [], position: 'pitcher' }), [])
  assert.deepEqual(resolvePlayerPositions({ positions: null, position: 'pitcher' }), ['pitcher'])
  assert.deepEqual(resolvePlayerPositions(null), [])
})

test('legacyPositionFrom keeps the old CHECK happy (pitcher | hitter | null)', () => {
  assert.equal(legacyPositionFrom(['hitter']), 'hitter')
  assert.equal(legacyPositionFrom(['hitter', 'catcher']), 'hitter')
  assert.equal(legacyPositionFrom(['pitcher']), 'pitcher')
  assert.equal(legacyPositionFrom(['two-way']), 'pitcher')
  assert.equal(legacyPositionFrom(['pitcher', 'hitter']), 'pitcher')
  assert.equal(legacyPositionFrom(['catcher']), null)
  assert.equal(legacyPositionFrom([]), null)
})

test('default clip kind: hitter-only is hitting; everything else is pitching', () => {
  assert.equal(defaultClipKind(['hitter']), 'hitting')
  assert.equal(defaultClipKind(['pitcher']), 'pitching')
  assert.equal(defaultClipKind(['hitter', 'pitcher']), 'pitching')
  assert.equal(defaultClipKind(['catcher']), 'pitching')
  assert.equal(defaultClipKind([]), 'pitching')
  assert.equal(resolveClipKind('hitting', ['pitcher']), 'hitting')
  assert.equal(resolveClipKind(null, ['hitter']), 'hitting')
  assert.equal(resolveClipKind('nope', ['hitter', 'pitcher']), 'pitching')
})

test('writeWithPositions fallback: only [] / pitcher / hitter retry; others error and write nothing', async () => {
  const missing = { code: 'PGRST204', message: "Could not find the 'positions' column of 'players'" }
  for (const ok of [[] as const, ['pitcher'] as const, ['hitter'] as const]) {
    const calls: Record<string, unknown>[] = []
    const r = await writeWithPositions({ full_name: 'A' }, [...ok], async (fields) => {
      calls.push(fields)
      if ('positions' in fields) return { error: missing }
      return { error: null }
    })
    assert.equal(r.error, null, String(ok))
    assert.equal(calls.length, 2, String(ok))
    assert.deepEqual(calls[1], { full_name: 'A', position: ok[0] ?? null })
  }
  for (const bad of [['catcher'], ['infield'], ['outfield'], ['two-way'], ['catcher', 'hitter'], ['pitcher', 'hitter']] as const) {
    const calls: Record<string, unknown>[] = []
    const r = await writeWithPositions({ full_name: 'A' }, [...bad], async (fields) => {
      calls.push(fields)
      if ('positions' in fields) return { error: missing }
      return { error: null }
    })
    assert.equal(r.error && 'message' in r.error ? r.error.message : '', POSITIONS_UNAVAILABLE, String(bad))
    assert.equal(calls.length, 1, `must not write the old column for ${String(bad)}`)
    assert.ok('positions' in calls[0])
  }
})

test('canRepresentAsLegacyPosition is only empty, pitcher-only, or hitter-only', () => {
  assert.equal(canRepresentAsLegacyPosition([]), true)
  assert.equal(canRepresentAsLegacyPosition(['pitcher']), true)
  assert.equal(canRepresentAsLegacyPosition(['hitter']), true)
  assert.equal(canRepresentAsLegacyPosition(['catcher']), false)
  assert.equal(canRepresentAsLegacyPosition(['two-way']), false)
  assert.equal(canRepresentAsLegacyPosition(['hitter', 'catcher']), false)
})
