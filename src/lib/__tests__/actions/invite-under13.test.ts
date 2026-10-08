/**
 * Launch policy (a): a coach can't add or invite a player whose birth
 * month/year makes them under 13. invitePlayer computes bandFromBirth on the
 * server and refuses an under-13 date BEFORE any player insert, team link,
 * invite link or email — including the duplicate-email/existing-player
 * branch — with an honest error that promises nothing, and never a success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/invite-under13.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { invitePlayer } from '../../../app/actions/invite'
import { UNDER_13_INVITE_REFUSED } from '../../under13-mode'
import { BIRTH_INVALID } from '../../age-band'

const COACH = { id: 'coach-1', email: 'coach@example.com' }
const now = new Date()
const THIS_MONTH = now.getMonth() + 1
const THIS_YEAR = now.getFullYear()

/** Firmly under 13 whatever the month. */
const UNDER_13 = { birth_month: '1', birth_year: String(THIS_YEAR - 10) }
/** Turns 13 this month: the birthday counts as not reached (younger wins). */
const TURNS_13_THIS_MONTH = { birth_month: String(THIS_MONTH), birth_year: String(THIS_YEAR - 13) }
/** Turned 13 last month (December of last year in January): firmly 13_17. */
const JUST_13 = THIS_MONTH > 1
  ? { birth_month: String(THIS_MONTH - 1), birth_year: String(THIS_YEAR - 13) }
  : { birth_month: '12', birth_year: String(THIS_YEAR - 14) }

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}
const invite = (email: string, birth: Record<string, string>, extra: Record<string, string | string[]> = {}) =>
  invitePlayer(undefined, form({ full_name: 'Young Player', player_email: email, ...birth, ...extra }))

const tables = () => ({
  profiles: [{ id: COACH.id, role: 'coach' }],
  teams: [{ id: 't1', coach_id: COACH.id, age_group: 'High School' }],
  players: [] as Record<string, unknown>[],
  player_teams: [] as Record<string, unknown>[],
})

const writes = () => state.ops.filter((o) =>
  (o.table === 'players' && (o.action === 'insert' || o.action === 'update')) ||
  (o.table === 'player_teams' && (o.action === 'insert' || o.action === 'upsert' || o.action === 'update')))

/** A refusal is an honest error only: never a success, never an invite link. */
function assertRefused(r: { error?: string; success?: string; inviteUrl?: string }) {
  assert.equal(UNDER_13_INVITE_REFUSED, "Players under 13 can't be added.")
  assert.doesNotMatch(UNDER_13_INVITE_REFUSED, /coming soon|yet\./i)
  assert.equal(r.error, UNDER_13_INVITE_REFUSED)
  assert.equal(r.success, undefined, 'a refusal must never look like success')
  assert.equal(r.inviteUrl, undefined, 'a refusal must never hand back an invite link')
}

beforeEach(() => {
  resetFake({ tables: tables(), user: COACH })
  authAdmin.reset()
  emailFake.reset()
})

test('under-13 date: refused before anything is written, linked or sent', async () => {
  const r = await invite('kid@example.com', UNDER_13, { team_ids: ['t1'] })
  assertRefused(r)
  assert.deepEqual(writes(), [], 'no player insert, no team link')
  assert.equal(state.tables.players.length, 0)
  assert.equal(state.tables.player_teams.length, 0)
  assert.equal(authAdmin.links.length, 0, 'no invite link generated')
  assert.equal(emailFake.invites.length, 0, 'no email sent')
})

test('under-13 wins over every other check: invalid team still reports under-13, nothing written', async () => {
  const r = await invite('kid@example.com', UNDER_13, { team_ids: ['no-such-team'] })
  assertRefused(r)
  assert.deepEqual(writes(), [])
})

test('existing-player branch: under-13 date for an email already on the roster is still refused, roster untouched', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: null, full_name: 'Nolan George' })
  const { fail } = await import('./fakes/db')
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  const r = await invite('kid@example.com', UNDER_13, { team_ids: ['t1'] })
  assertRefused(r)
  assert.equal(state.tables.player_teams.length, 0, 'no team link added')
  assert.equal(emailFake.invites.length, 0, 'no email sent')
  assert.equal(authAdmin.links.length, 0, 'no invite link generated')
})

test('existing-player branch: a 13+ date for an email already on the roster still works as before', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'teen@example.com', user_id: null, full_name: 'Tia Teen' })
  const { fail } = await import('./fakes/db')
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  const r = await invite('teen@example.com', JUST_13, { team_ids: ['t1'] })
  assert.equal(r.error, undefined)
  assert.match(r.success ?? '', /Invite sent to teen@example\.com/)
  assert.equal(state.tables.player_teams.length, 1)
})

test('month boundary: turning 13 this month counts as not reached yet -> refused', async () => {
  const r = await invite('almost@example.com', TURNS_13_THIS_MONTH)
  assertRefused(r)
  assert.equal(state.tables.players.length, 0)
})

test('month boundary: turned 13 last month -> 13_17, invite goes out with no band stored', async () => {
  const r = await invite('just13@example.com', JUST_13, { team_ids: ['t1'] })
  assert.equal(r.error, undefined)
  assert.match(r.success ?? '', /Invite sent/)
  const row = state.tables.players[0]
  for (const c of ['age_band', 'age_band_coach', 'age_band_self', 'age_screen_at', 'age_confirmed_at']) {
    assert.equal(row[c] ?? null, null, `${c}: the birth month/year is never stored`)
  }
  assert.equal(state.tables.player_teams.length, 1)
  assert.equal(emailFake.invites.length, 1)
})

test('missing or invalid birth fields -> neutral error, nothing written or sent', async () => {
  for (const birth of [{}, { birth_month: '6' }, { birth_month: '13', birth_year: '2030' }]) {
    resetFake({ tables: tables(), user: COACH })
    authAdmin.reset()
    emailFake.reset()
    const r = await invite('kid@example.com', birth as Record<string, string>)
    assert.equal(r.error, BIRTH_INVALID)
    assert.equal(r.success, undefined)
    assert.equal(r.inviteUrl, undefined)
    assert.deepEqual(writes(), [])
    assert.equal(emailFake.invites.length, 0)
  }
})
