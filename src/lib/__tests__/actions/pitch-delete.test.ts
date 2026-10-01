/**
 * QA-017: deleting saved pitch rows. The player's coach may delete any row on
 * the clip, the player only rows they added; failures come back as errors and
 * leave the rows in place.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/pitch-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { deletePitchMetric, deleteAllPitchMetrics } from '../../../app/actions/clips'

const P = 'player-1'
const C = 'clip-1'
const COACH = { id: 'coach', email: 'coach@example.com' }
const PLAYER = { id: 'player-user', email: 'p@example.com' }
const OTHER = { id: 'other-coach', email: 'o@example.com' }

function seed(user: { id: string; email: string }) {
  resetFake({
    user,
    tables: {
      clips: [{ id: C, player_id: P }, { id: 'clip-2', player_id: P }],
      players: [{ id: P, coach_id: COACH.id, user_id: PLAYER.id }],
      pitch_metrics: [
        { id: 'm1', clip_id: C, created_by: COACH.id },
        { id: 'm2', clip_id: C, created_by: COACH.id },
        { id: 'm3', clip_id: C, created_by: PLAYER.id },
        { id: 'm9', clip_id: 'clip-2', created_by: COACH.id },
      ],
    },
  })
}
const ids = () => state.tables.pitch_metrics.map(r => r.id)

test('coach deletes one imported pitch row', async () => {
  seed(COACH)
  assert.deepEqual(await deletePitchMetric('m1'), { success: true })
  assert.deepEqual(ids(), ['m2', 'm3', 'm9'])
  assert.ok(state.revalidated.includes(`/clips/${C}`))
})

test('a failed delete returns an error and keeps the row', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'delete', error: { message: 'boom' } })
  const r = await deletePitchMetric('m1')
  assert.ok('error' in r && r.error, JSON.stringify(r))
  assert.deepEqual(ids(), ['m1', 'm2', 'm3', 'm9'])
})

test('a pitch that is already gone is an error, not a success', async () => {
  seed(COACH)
  const r = await deletePitchMetric('missing')
  assert.ok('error' in r && /already removed/.test(String(r.error)))
})

test('player may delete a row they added, not the coach\'s; other coaches may not delete', async () => {
  seed(PLAYER)
  assert.ok('error' in await deletePitchMetric('m1'))
  assert.deepEqual(await deletePitchMetric('m3'), { success: true })
  seed(OTHER)
  assert.ok('error' in await deletePitchMetric('m1'))
  assert.equal(ids().length, 4)
})

test('coach deletes all pitch rows of one clip (other clips untouched)', async () => {
  seed(COACH)
  const r = await deleteAllPitchMetrics(C)
  assert.equal((r as { success?: boolean }).success, true)
  assert.deepEqual([...(r as { removedIds: string[] }).removedIds].sort(), ['m1', 'm2', 'm3'])
  assert.deepEqual(ids(), ['m9'])
})

test('delete all: database error -> error, every row kept', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'delete', error: { message: 'boom' } })
  const r = await deleteAllPitchMetrics(C)
  assert.ok('error' in r && r.error)
  assert.equal(ids().length, 4)
})

test('delete all as the player removes only their own rows and says which', async () => {
  seed(PLAYER)
  const r = await deleteAllPitchMetrics(C) as { success: true; removedIds: string[] }
  assert.deepEqual(r.removedIds, ['m3'])
  assert.deepEqual(ids(), ['m1', 'm2', 'm9'])
  seed(OTHER)
  assert.ok('error' in await deleteAllPitchMetrics(C))
  assert.equal(ids().length, 4)
})
