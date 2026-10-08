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
  assert.equal(parsePositionsInput(['shortstop']).ok, false)
  assert.equal(parsePositionsInput(['shortstop']).ok === false && parsePositionsInput(['shortstop']).error, INVALID_POSITIONS)
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

test('writeWithPositions dual-writes and retries without positions when the column is missing', async () => {
  const calls: Record<string, unknown>[] = []
  const r = await writeWithPositions({ full_name: 'A' }, ['catcher', 'hitter'], async (fields) => {
    calls.push(fields)
    if ('positions' in fields) return { error: { code: 'PGRST204', message: "Could not find the 'positions' column of 'players'" } }
    return { error: null }
  })
  assert.equal(r.error, null)
  assert.deepEqual(calls[0], { full_name: 'A', positions: ['catcher', 'hitter'], position: 'hitter' })
  assert.deepEqual(calls[1], { full_name: 'A', position: 'hitter' })
})
