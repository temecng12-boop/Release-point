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
  fd.append('file', new File([new Uint8Array([1, 2, 3])], 'avatar.jpg', { type: 'image/jpeg' }))
  return fd
}

const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'me@example.com' }
const AVATAR = `avatars/${ME.id}.jpg`
const seedMe = () => resetFake({ user: ME, tables: { profiles: [{ id: ME.id, avatar_url: 'https://old.example/x.jpg' }] } })

test('uploadAvatar: profile update fails -> error, no avatarUrl returned', async () => {
  seedMe()
  fail({ table: 'profiles', action: 'update', error: { message: 'boom' } })
  const r = await uploadAvatar(avatarForm())
  assert.ok('error' in r && r.error)
  assert.equal('avatarUrl' in r, false)
  assert.doesNotMatch(r.error, /boom/)
})

test('uploadAvatar: success stores the object path (not a URL) and returns a 1-hour signed URL', async () => {
  seedMe()
  const r = await uploadAvatar(avatarForm())
  assert.ok(!('error' in r))
  assert.equal(r.success, true)
  assert.equal(state.tables.profiles[0].avatar_url, AVATAR)
  assert.deepEqual(state.storage.clips, [AVATAR])
  assert.equal(r.avatarUrl, `https://storage.test/clips/${AVATAR}?token=t`)
  assert.deepEqual(state.signed, [{ bucket: 'clips', path: AVATAR, expiresIn: 3600 }])
})

test('uploadAvatar: storage upload fails -> friendly error, profile unchanged, no raw storage message', async () => {
  seedMe()
  fail({ bucket: 'clips', storageOp: 'upload', error: { message: 'new row violates row-level security policy' } })
  const r = await uploadAvatar(avatarForm())
  assert.ok('error' in r)
  assert.doesNotMatch(r.error, /row-level|policy/)
  assert.equal(state.tables.profiles[0].avatar_url, 'https://old.example/x.jpg')
})

test('uploadAvatar: saved but signing fails -> success with no URL and a notice (not an error, not a fake image)', async () => {
  seedMe()
  fail({ bucket: 'clips', storageOp: 'sign', error: { message: 'down' } })
  const r = await uploadAvatar(avatarForm())
  assert.ok(!('error' in r))
  assert.equal(r.avatarUrl, null)
  assert.match(String(r.notice), /saved/i)
  assert.equal(state.tables.profiles[0].avatar_url, AVATAR)
})

test('uploadAvatar: not signed in, no file, or a non-image -> error, nothing written', async () => {
  resetFake({ user: null, tables: { profiles: [] } })
  assert.ok('error' in (await uploadAvatar(avatarForm())))
  seedMe()
  assert.ok('error' in (await uploadAvatar(new FormData())))
  const fd = new FormData(); fd.append('file', new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' }))
  assert.ok('error' in (await uploadAvatar(fd)))
  assert.equal(state.storage.clips, undefined)
  assert.equal(state.tables.profiles[0].avatar_url, 'https://old.example/x.jpg')
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
