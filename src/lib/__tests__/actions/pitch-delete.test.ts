/**
 * QA-017: deleting saved pitch rows and saved hitting data. The deletes run
 * with the signed-in user's own client, so RLS decides who may delete; the
 * fake applies the same rules as the migrations (pitch_metrics_coach_all in
 * 002: direct coach only; clips_coach_all in 018: direct or team coach may
 * update clips; players only read). A delete RLS refuses removes 0 rows and
 * must come back as an error, never as success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/pitch-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state, type Row } from './fakes/db'
import { deletePitchMetric, deleteAllPitchMetrics, deleteHittingMetric, deleteAllHittingMetrics } from '../../../app/actions/clips'

const P = 'player-1'
const C = 'clip-1'
const COACH = { id: 'coach', email: 'coach@example.com' }
const TEAM_COACH = { id: 'team-coach', email: 't@example.com' }
const PLAYER = { id: 'player-user', email: 'p@example.com' }
const OTHER = { id: 'other-coach', email: 'o@example.com' }
const HIT = { ev_avg: 88.1, ev_max: 97.4, launch_angle_avg: 14, barrel_rate: null, hard_hit_rate: 41, sweet_spot_rate: null, attack_angle: null, bat_speed: 66 }

function seed(user: { id: string; email: string }) {
  resetFake({
    user,
    tables: {
      clips: [{ id: C, player_id: P, hitting_metrics: { ...HIT } }, { id: 'clip-2', player_id: P, hitting_metrics: { ...HIT } }],
      players: [{ id: P, coach_id: COACH.id, user_id: PLAYER.id, team_id: 't1' }],
      team_coaches: [{ team_id: 't1', coach_id: TEAM_COACH.id, role: 'assistant' }],
      player_teams: [{ player_id: P, team_id: 't1' }],
      pitch_metrics: [
        { id: 'm1', clip_id: C, created_by: COACH.id },
        { id: 'm2', clip_id: C, created_by: COACH.id },
        { id: 'm3', clip_id: C, created_by: PLAYER.id },
        { id: 'm9', clip_id: 'clip-2', created_by: COACH.id },
      ],
    },
  })
  // RLS as in the migrations. TEAM_COACH coaches the player's team.
  const player = (clipId: unknown) => state.tables.players.find(p => p.id === state.tables.clips.find(c => c.id === clipId)?.player_id)
  const direct = (p: Row | undefined, uid: string | null) => !!p && !!uid && p.coach_id === uid
  const team = (uid: string | null) => uid === TEAM_COACH.id
  const self = (p: Row | undefined, uid: string | null) => !!p && !!uid && p.user_id === uid
  state.rls = {
    pitch_metrics: (r, action, uid) => {
      const p = player(r.clip_id)
      return action === 'select' ? direct(p, uid) || team(uid) || self(p, uid) : direct(p, uid) || team(uid)
    },
    clips: (r, action, uid) => {
      const p = player(r.id)
      return action === 'select' ? direct(p, uid) || team(uid) || self(p, uid) : direct(p, uid) || team(uid)
    },
    players: (r, action, uid) => action === 'select' && (direct(r, uid) || team(uid) || self(r, uid)),
  }
}
const ids = () => state.tables.pitch_metrics.map(r => r.id)
const hitting = (clipId = C) => state.tables.clips.find(c => c.id === clipId)?.hitting_metrics as Record<string, number | null> | null
const isError = (r: unknown) => !!r && typeof r === 'object' && 'error' in r && !!(r as { error: unknown }).error
const noAdminWrites = () => state.ops.filter(o => o.via === 'admin' && o.action !== 'select')

// ── Pitch rows ───────────────────────────────────────────────────────────────

test('direct coach deletes one pitch row, through the session client (RLS), not the service role', async () => {
  seed(COACH)
  assert.deepEqual(await deletePitchMetric('m1'), { success: true })
  assert.deepEqual(ids(), ['m2', 'm3', 'm9'])
  assert.ok(state.revalidated.includes(`/clips/${C}`))
  const del = state.ops.filter(o => o.table === 'pitch_metrics' && o.action === 'delete')
  assert.deepEqual(del.map(o => o.via), ['session'])
  assert.equal(state.ops.filter(o => o.via === 'admin').length, 0, 'no service-role queries at all')
})

test('a failed delete returns an error and keeps the row', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'delete', error: { message: 'boom' } })
  const r = await deletePitchMetric('m1')
  assert.ok(isError(r), JSON.stringify(r))
  assert.deepEqual(ids(), ['m1', 'm2', 'm3', 'm9'])
})

test('team coach on the player\'s team can delete a pitch row', async () => {
  seed(TEAM_COACH)
  assert.deepEqual(await deletePitchMetric('m1'), { success: true })
  assert.deepEqual(ids(), ['m2', 'm3', 'm9'])
})

test('RLS denial (0 rows deleted) is an error, not a success: player (even own row), other coach', async () => {
  for (const user of [PLAYER, OTHER]) {
    seed(user)
    for (const id of ['m1', 'm3']) {
      const r = await deletePitchMetric(id)
      assert.ok(isError(r) && /Only a coach of this player/.test(String((r as { error: string }).error)), `${user.id} ${id}: ${JSON.stringify(r)}`)
    }
    assert.equal(ids().length, 4)
    assert.equal(state.revalidated.length, 0)
    assert.deepEqual(noAdminWrites(), [])
  }
})

test('a pitch that is already gone (0 rows) is an error, not a success', async () => {
  seed(COACH)
  assert.ok(isError(await deletePitchMetric('missing')))
})

test('direct coach deletes all pitch rows of one clip (other clips untouched)', async () => {
  seed(COACH)
  const r = await deleteAllPitchMetrics(C)
  assert.equal((r as { success?: boolean }).success, true)
  assert.deepEqual([...(r as { removedIds: string[] }).removedIds].sort(), ['m1', 'm2', 'm3'])
  assert.deepEqual(ids(), ['m9'])
  assert.deepEqual(state.ops.filter(o => o.action === 'delete').map(o => o.via), ['session'])
})

test('delete all: database error -> error, every row kept', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'delete', error: { message: 'boom' } })
  assert.ok(isError(await deleteAllPitchMetrics(C)))
  assert.equal(ids().length, 4)
})

test('delete all refused by RLS (0 rows) is an error for player and other coach', async () => {
  for (const user of [PLAYER, OTHER]) {
    seed(user)
    const r = await deleteAllPitchMetrics(C)
    assert.ok(isError(r), `${user.id}: ${JSON.stringify(r)}`)
    assert.ok(!('removedIds' in (r as object)))
    assert.equal(ids().length, 4)
    assert.deepEqual(noAdminWrites(), [])
  }
})

// ── Hitting data (clips.hitting_metrics) ─────────────────────────────────────

test('hitting: direct coach deletes one saved value via the session client', async () => {
  seed(COACH)
  assert.deepEqual(await deleteHittingMetric(C, 'ev_max'), { success: true })
  assert.deepEqual(hitting(), { ...HIT, ev_max: null })
  assert.deepEqual(hitting('clip-2'), HIT, 'other clip untouched')
  assert.ok(state.revalidated.includes(`/clips/${C}`))
  assert.deepEqual(state.ops.filter(o => o.action === 'update').map(o => [o.table, o.via]), [['clips', 'session']])
  assert.equal(state.ops.filter(o => o.via === 'admin').length, 0)
})

test('hitting: deleting the last saved value clears the summary', async () => {
  seed(COACH)
  state.tables.clips[0].hitting_metrics = { ...HIT, ev_avg: null, ev_max: null, launch_angle_avg: null, hard_hit_rate: null }
  assert.deepEqual(await deleteHittingMetric(C, 'bat_speed'), { success: true })
  assert.equal(hitting(), null)
})

test('hitting: direct coach deletes all hitting data of one clip', async () => {
  seed(COACH)
  assert.deepEqual(await deleteAllHittingMetrics(C), { success: true })
  assert.equal(hitting(), null)
  assert.deepEqual(hitting('clip-2'), HIT)
})

test('hitting: team coach on the player\'s team can delete saved values', async () => {
  seed(TEAM_COACH)
  assert.deepEqual(await deleteHittingMetric(C, 'ev_max'), { success: true })
  assert.deepEqual(hitting(), { ...HIT, ev_max: null })
  assert.deepEqual(await deleteAllHittingMetrics(C), { success: true })
  assert.equal(hitting(), null)
})

test('hitting: player and other coach are refused, nothing changes', async () => {
  for (const user of [PLAYER, OTHER]) {
    seed(user)
    assert.ok(isError(await deleteHittingMetric(C, 'ev_max')), user.id)
    assert.ok(isError(await deleteAllHittingMetrics(C)), user.id)
    assert.deepEqual(hitting(), HIT)
  }
})

test('hitting: an update that changes 0 rows (RLS) is an error, not a success', async () => {
  seed(COACH)
  const clipsRule = state.rls.clips
  state.rls.clips = (r, action, uid) => action === 'select' && clipsRule(r, action, uid)  // e.g. policy missing
  assert.ok(isError(await deleteHittingMetric(C, 'ev_max')))
  assert.ok(isError(await deleteAllHittingMetrics(C)))
  assert.equal(state.revalidated.length, 0)
})

test('hitting: database error, unknown metric and already-empty values are errors', async () => {
  seed(COACH)
  fail({ table: 'clips', action: 'update', error: { message: 'boom' } })
  assert.ok(isError(await deleteHittingMetric(C, 'ev_max')))
  assert.ok(isError(await deleteAllHittingMetrics(C)))
  assert.deepEqual(hitting(), HIT)
  seed(COACH)
  assert.ok(isError(await deleteHittingMetric(C, 'barrel_rate')), 'not saved -> nothing to delete')
  assert.ok(isError(await deleteHittingMetric(C, 'nope' as 'ev_max')))
  state.tables.clips[0].hitting_metrics = null
  assert.ok(isError(await deleteAllHittingMetrics(C)))
})
