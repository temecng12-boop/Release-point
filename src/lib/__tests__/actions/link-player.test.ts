/**
 * linkPlayerRow: returns { error } when any write fails (so the confirm page
 * can tell the player and offer a retry), and a retry finishes the job.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/link-player.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { linkPlayerRow } from '../../../app/actions/auth'

const PLAYER = { id: 'u-player', email: 'kid@example.com', user_metadata: { role: 'player', full_name: 'Kid Player' } }
const invited = () => ({ players: [{ id: 'p1', email: PLAYER.email, user_id: null, coach_id: 'coach' }], profiles: [] })

beforeEach(() => { resetFake({ tables: invited(), user: PLAYER }) })

test('invited player: links the invite row and reports success', async () => {
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players[0].user_id, PLAYER.id)
  assert.equal(state.tables.profiles.length, 1)
})

test('invite link update fails: returns a clear error, row stays unlinked, no standalone row created', async () => {
  fail({ table: 'players', action: 'update', error: { code: '57014', message: 'timeout' } })
  const r = await linkPlayerRow()
  assert.ok('error' in r)
  assert.match(r.error, /signed in, but we couldn't connect your account/)
  assert.match(r.error, /contact your coach/)
  assert.equal(state.tables.players.length, 1)
  assert.equal(state.tables.players[0].user_id, null)
})

test('profile upsert fails: error', async () => {
  fail({ table: 'profiles', action: 'upsert', error: { message: 'boom' } })
  assert.ok('error' in await linkPlayerRow())
})

test('no invite: lookup or insert failure returns an error', async () => {
  resetFake({ tables: { players: [], profiles: [] }, user: PLAYER })
  fail({ table: 'players', action: 'insert', error: { message: 'boom' } })
  assert.ok('error' in await linkPlayerRow())
  assert.equal(state.tables.players.length, 0)

  resetFake({ tables: { players: [], profiles: [] }, user: PLAYER })
  fail({ table: 'players', action: 'select', error: { message: 'boom' } })
  assert.ok('error' in await linkPlayerRow())
  assert.equal(state.ops.some(o => o.action === 'insert'), false)
})

test('retry after a failed link succeeds and links the invite', async () => {
  fail({ table: 'players', action: 'update', error: { message: 'timeout' }, times: 1 })
  assert.ok('error' in await linkPlayerRow())
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players[0].user_id, PLAYER.id)
})

test('running again after success does not create a duplicate player row', async () => {
  resetFake({ tables: { players: [], profiles: [] }, user: PLAYER })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players.length, 1)
})

test('no session: error, not a silent no-op', async () => {
  resetFake({ tables: invited(), user: null })
  assert.ok('error' in await linkPlayerRow())
})

test('coach (non-player) sign-in: only the profile is ensured', async () => {
  resetFake({ tables: invited(), user: { ...PLAYER, user_metadata: { role: 'coach', full_name: 'C' } } })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players[0].user_id, null)
})
