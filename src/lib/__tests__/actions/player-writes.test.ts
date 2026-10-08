/**
 * Player actions: avatar profile write and team sync failures are reported,
 * not returned as success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/player-writes.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { uploadAvatar, updatePlayer, savePlayerPosition, updatePlayerSelfProfile } from '../../../app/actions/player'

const COACH = { id: 'coach', email: 'coach@example.com' }

function avatarForm() {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])], 'avatar.jpg', { type: 'image/jpeg' }))
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

test('updatePlayer: multi-select positions dual-write; empty is valid; unknown tag is an error', async () => {
  seedRoster()
  const r = await updatePlayer('p1', { positions: ['catcher', 'hitter'] })
  assert.deepEqual(r, { success: true })
  assert.deepEqual(state.tables.players[0].positions, ['catcher', 'hitter'])
  assert.equal(state.tables.players[0].position, 'hitter')
  assert.deepEqual(await updatePlayer('p1', { positions: [] }), { success: true })
  assert.deepEqual(state.tables.players[0].positions, [])
  assert.equal(state.tables.players[0].position, null)
  const bad = await updatePlayer('p1', { positions: ['shortstop'] })
  assert.match(String((bad as { error?: string }).error), /valid position/)
})

test('updatePlayer: missing positions column retries with only the old pitcher/hitter value', async () => {
  seedRoster()
  fail({ table: 'players', action: 'update', error: { code: 'PGRST204', message: "Could not find the 'positions' column of 'players'" }, times: 1 })
  const r = await updatePlayer('p1', { positions: ['catcher'] })
  assert.deepEqual(r, { success: true })
  assert.equal(state.tables.players[0].position, null)
})

test('savePlayerPosition: player writes their own chips; empty is valid', async () => {
  resetFake({
    user: { id: 'player-1', email: 'p@example.com' },
    tables: { players: [{ id: 'p1', user_id: 'player-1', position: null }] },
  })
  assert.deepEqual(await savePlayerPosition(['infield', 'outfield']), { success: true })
  assert.deepEqual(state.tables.players[0].positions, ['infield', 'outfield'])
  assert.equal(state.tables.players[0].position, null)
  assert.deepEqual(await savePlayerPosition([]), { success: true })
  assert.deepEqual(state.tables.players[0].positions, [])
})

test('updatePlayerSelfProfile: positions are written with the profile', async () => {
  resetFake({
    user: { id: 'player-1', email: 'p@example.com' },
    tables: { players: [{ id: 'p1', user_id: 'player-1', height: '6-1' }] },
  })
  const r = await updatePlayerSelfProfile({ height: '6-2', positions: ['two-way'] })
  assert.deepEqual(r, { success: true })
  assert.equal(state.tables.players[0].height, '6-2')
  assert.deepEqual(state.tables.players[0].positions, ['two-way'])
  assert.equal(state.tables.players[0].position, 'pitcher')
})
