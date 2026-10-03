/**
 * Player actions: avatar profile write and team sync failures are reported,
 * not returned as success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/player-writes.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { uploadAvatar, updatePlayer } from '../../../app/actions/player'

const COACH = { id: 'coach', email: 'coach@example.com' }

function avatarForm() {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])], 'avatar.jpg', { type: 'image/jpeg' }))
  return fd
}

test('uploadAvatar: profile update fails -> error, no avatarUrl returned', async () => {
  resetFake({ user: COACH, tables: { profiles: [{ id: COACH.id, avatar_url: null }] } })
  fail({ table: 'profiles', action: 'update', error: { message: 'boom' } })
  const r = await uploadAvatar(avatarForm())
  assert.ok('error' in r && r.error)
  assert.equal('avatarUrl' in r, false)
})

test('uploadAvatar: success saves the URL on the profile', async () => {
  resetFake({ user: COACH, tables: { profiles: [{ id: COACH.id, avatar_url: null }] } })
  const r = await uploadAvatar(avatarForm())
  assert.equal(r.success, true)
  assert.match(String(state.tables.profiles[0].avatar_url), /avatars\/coach\.jpg/)
})

const seedRoster = () => resetFake({
  user: COACH,
  tables: {
    players: [{ id: 'p1', coach_id: COACH.id, full_name: 'A' }],
    teams: [{ id: 't1', coach_id: COACH.id }, { id: 't2', coach_id: COACH.id }],
    player_teams: [{ player_id: 'p1', team_id: 't1' }],
  },
})

for (const action of ['delete', 'insert'] as const) {
  test(`updatePlayer: team ${action} fails -> error instead of success`, async () => {
    seedRoster()
    fail({ table: 'player_teams', action, error: { message: 'boom' } })
    const r = await updatePlayer('p1', { full_name: 'b', teamIds: ['t2'] })
    assert.match(String((r as { error?: string }).error), /team changes couldn't be saved/)
  })
}

test('updatePlayer: retry after a failed team insert ends with the chosen teams', async () => {
  seedRoster()
  fail({ table: 'player_teams', action: 'insert', error: { message: 'boom' }, times: 1 })
  assert.ok('error' in await updatePlayer('p1', { teamIds: ['t2'] }))
  assert.deepEqual(await updatePlayer('p1', { teamIds: ['t2'] }), { success: true })
  assert.deepEqual(state.tables.player_teams.map(r => r.team_id), ['t2'])
})
