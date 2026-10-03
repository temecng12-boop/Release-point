/**
 * Age bands (037) in the server actions:
 * - self-signup: birth month/year first; under 13 is a hard stop (no Supabase
 *   call, nothing stored, a session cookie blocks another answer); ToS required;
 * - the first-sign-in age screen (submitAgeAnswer): one answer, under 13
 *   stores only the band, signs the player out and sets the cookie;
 * - linkPlayerRow stores the signup band (younger answer wins);
 * - setPlayerAgeBand: the player's own coach only; the younger band is kept.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/age-flow.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { otpCalls } from './fakes/supabase-server'
import { checkSignupAge, signUpPlayer, linkPlayerRow } from '../../../app/actions/auth'
import { submitAgeAnswer } from '../../../app/actions/age'
import { setPlayerAgeBand } from '../../../app/actions/player'

const Y = new Date().getFullYear()
const UNDER_13 = { birth_month: '1', birth_year: String(Y - 6) }
const TEEN = { birth_month: '1', birth_year: String(Y - 15) }
const ADULT = { birth_month: '1', birth_year: '1990' }
const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f }
const signupForm = (birth: Record<string, string>, extra: Record<string, string> = { tos: 'yes' }) =>
  fd({ email: 'p@example.com', full_name: 'pat lee', ...birth, ...extra })
const quiet = async <R>(fn: () => Promise<R>) => {
  const e = console.error, w = console.warn
  console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.error = e; console.warn = w }
}

beforeEach(() => { resetFake(); otpCalls.length = 0 })

// ── self-signup ─────────────────────────────────────────────────────────────
test('checkSignupAge: under 13 -> stopped, session cookie set, nothing written', async () => {
  assert.deepEqual(await checkSignupAge(undefined, fd(UNDER_13)), { stopped: true })
  assert.equal(state.cookies.rp_age_stop?.value, '1')
  assert.equal(state.cookies.rp_age_stop?.options?.httpOnly, true)
  assert.equal(state.cookies.rp_age_stop?.options?.maxAge, undefined, 'session cookie')
  assert.equal(state.cookies.rp_age_stop?.options?.expires, undefined, 'session cookie')
  assert.deepEqual(state.ops, [])
})

test('checkSignupAge: the cookie blocks another answer, even an adult one', async () => {
  await checkSignupAge(undefined, fd(UNDER_13))
  assert.deepEqual(await checkSignupAge(undefined, fd(ADULT)), { stopped: true })
  assert.deepEqual(await signUpPlayer(undefined, signupForm(ADULT)), { stopped: true })
  assert.equal(otpCalls.length, 0)
})

test('checkSignupAge: 13 to 17 and 18+ go on to step 2; invalid answers get an error', async () => {
  assert.equal((await checkSignupAge(undefined, fd(TEEN))).ok, true)
  assert.equal((await checkSignupAge(undefined, fd(ADULT))).ok, true)
  assert.equal((await checkSignupAge(undefined, fd({ birth_month: '13', birth_year: '2000' }))).error, 'Enter your birth month and year.')
  assert.equal((await checkSignupAge(undefined, fd({ birth_month: '1', birth_year: String(Y + 1) }))).error, 'Enter your birth month and year.')
  assert.equal(state.cookies.rp_age_stop, undefined)
})

test('signUpPlayer: under 13 makes no Supabase call and stores nothing', async () => {
  assert.deepEqual(await signUpPlayer(undefined, signupForm(UNDER_13)), { stopped: true })
  assert.equal(otpCalls.length, 0)
  assert.deepEqual(state.ops, [])
  assert.ok(state.cookies.rp_age_stop)
})

test('signUpPlayer: Terms not accepted -> error, no Supabase call', async () => {
  const r = await signUpPlayer(undefined, signupForm(ADULT, {}))
  assert.equal(r.error, 'You must accept the Terms of Service to continue.')
  assert.equal(otpCalls.length, 0)
})

test('signUpPlayer: 13 to 17 -> sign-in link with the band only (no month/year), the answer time and ToS time', async () => {
  assert.deepEqual(await signUpPlayer(undefined, signupForm(TEEN)), { sent: true, email: 'p@example.com' })
  const data = (otpCalls[0].options as { data?: Record<string, unknown> }).data!
  assert.equal(data.age_band, '13_17')
  assert.equal(data.role, 'player')
  assert.ok(typeof data.age_screen_at === 'string' && typeof data.tos_accepted_at === 'string')
  assert.ok(!JSON.stringify(data).includes(TEEN.birth_year), 'birth year is not stored')
  assert.equal('birth_month' in data, false)
})

// ── first-sign-in age screen ────────────────────────────────────────────────
const PU = { id: 'u-p', email: 'kid@example.com' }
const seedPlayer = (row: Record<string, unknown> = {}, extra: Record<string, unknown[]> = {}) => resetFake({
  user: PU,
  tables: {
    players: [{ id: 'p1', user_id: PU.id, coach_id: 'coach', guardian_id: null, team_id: null, age_group: null,
      age_band: null, age_band_coach: null, age_band_self: null, age_screen_at: null, age_confirmed_at: null,
      adult_confirmed_at: null, consent_given_at: null, ...row }],
    player_teams: [], teams: [], ...extra,
  },
})
const p1 = () => state.tables.players[0]

test('submitAgeAnswer: invited player answers 18+, coach said 18+ -> 18+, screen done', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus', age_confirmed_at: 'x' })
  assert.deepEqual(await submitAgeAnswer(undefined, fd(ADULT)), { done: true })
  assert.equal(p1().age_band_self, '18_plus')
  assert.equal(p1().age_band, '18_plus')
  assert.ok(p1().age_screen_at)
})

test('submitAgeAnswer: player answer younger than the coach\'s -> the younger band wins', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus', age_confirmed_at: 'x' })
  await submitAgeAnswer(undefined, fd(TEEN))
  assert.equal(p1().age_band, '13_17')
  assert.equal(p1().age_band_source, 'self')
  assert.equal(p1().adult_confirmed_at ?? null, null, '18+ confirmation cleared to match')
})

test('submitAgeAnswer: only one answer; a second is refused and changes nothing', async () => {
  seedPlayer({ age_band_coach: '13_17', age_band: '13_17' })
  await submitAgeAnswer(undefined, fd(TEEN))
  const before = structuredClone(p1())
  const r = await submitAgeAnswer(undefined, fd(ADULT))
  assert.match(String(r?.error), /already answered/)
  assert.deepEqual(p1(), before)
})

test('submitAgeAnswer: under 13 -> stores only the band, signs out, sets the cookie; retries are stopped', async () => {
  seedPlayer({ age_band_coach: '13_17', age_band: '13_17', age_confirmed_at: 'x' })
  assert.deepEqual(await submitAgeAnswer(undefined, fd(UNDER_13)), { stopped: true })
  assert.equal(p1().age_band_self, 'under_13')
  assert.equal(p1().age_band, 'under_13')
  assert.ok(!JSON.stringify(p1()).includes(UNDER_13.birth_year), 'birth year not stored')
  assert.equal(state.signOuts, 1)
  assert.ok(state.cookies.rp_age_stop)
  const writes = state.ops.filter(o => o.action !== 'select').length
  assert.deepEqual(await submitAgeAnswer(undefined, fd(ADULT)), { stopped: true })
  assert.equal(state.ops.filter(o => o.action !== 'select').length, writes, 'nothing written after the stop')
})

test('submitAgeAnswer: under 13 still signs out and stops if the write fails (and logs it)', async () => {
  seedPlayer()
  fail({ table: 'players', action: 'update', error: { message: 'boom' } })
  assert.deepEqual(await quiet(() => submitAgeAnswer(undefined, fd(UNDER_13))), { stopped: true })
  assert.equal(state.signOuts, 1)
})

test('submitAgeAnswer: write fails for an older answer -> error, not done', async () => {
  seedPlayer()
  fail({ table: 'players', action: 'update', error: { message: 'boom' } })
  const r = await quiet(() => submitAgeAnswer(undefined, fd(ADULT)))
  assert.equal(r?.error, "We couldn't save your answer. Please try again.")
  assert.equal(p1().age_screen_at, null)
})

test('submitAgeAnswer: player on an under-13 age-group team answering 18+ -> under 13', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus' }, { player_teams: [{ player_id: 'p1', team_id: 't' }], teams: [{ id: 't', age_group: '10-12' }] })
  await submitAgeAnswer(undefined, fd(ADULT))
  assert.equal(p1().age_band, 'under_13')
})

test('submitAgeAnswer: player with no coach confirms once (13 to 17)', async () => {
  seedPlayer({ coach_id: null })
  assert.deepEqual(await submitAgeAnswer(undefined, fd(TEEN)), { done: true })
  assert.equal(p1().age_band, '13_17')
  assert.ok(p1().age_confirmed_at)
})

test('submitAgeAnswer: signed out -> error', async () => {
  seedPlayer(); state.user = null
  assert.equal((await submitAgeAnswer(undefined, fd(ADULT)))?.error, 'Your session has expired. Sign in again.')
})

// ── linkPlayerRow ───────────────────────────────────────────────────────────
test('linkPlayerRow: new self-signup gets a row with its band answered', async () => {
  resetFake({ user: { ...PU, user_metadata: { role: 'player', full_name: 'Kid', age_band: '13_17', age_screen_at: '2026-10-03T10:00:00.000Z', tos_accepted_at: '2026-10-03T10:00:00.000Z' } }, tables: { players: [], profiles: [] } })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  const row = state.tables.players[0]
  assert.equal(row.age_band_self, '13_17')
  assert.equal(row.age_band, '13_17')
  assert.equal(row.age_screen_at, '2026-10-03T10:00:00.000Z')
  assert.equal(state.tables.profiles[0].role, 'player')
})

test('linkPlayerRow: invited email signing up as 13 to 17 when the coach said 18+ -> 13 to 17', async () => {
  resetFake({
    user: { ...PU, user_metadata: { role: 'player', age_band: '13_17' } },
    tables: { profiles: [], player_teams: [], teams: [], players: [{ id: 'p1', email: PU.email, user_id: null, coach_id: 'coach', guardian_id: null, team_id: null, age_group: null, age_band_coach: '18_plus', age_band: '18_plus', age_band_self: null, age_screen_at: null }] },
  })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(p1().user_id, PU.id)
  assert.equal(p1().age_band, '13_17')
  assert.equal(p1().age_band_coach, '18_plus', 'the coach answer is kept')
})

test('linkPlayerRow: forged metadata role "coach" still creates a player profile', async () => {
  resetFake({ user: { ...PU, user_metadata: { role: 'coach', age_band: '18_plus' } }, tables: { players: [], profiles: [] } })
  await linkPlayerRow()
  assert.equal(state.tables.profiles[0].role, 'player')
})

// ── setPlayerAgeBand ────────────────────────────────────────────────────────
const COACH = { id: 'coach', email: 'c@example.com' }
const seedCoach = (row: Record<string, unknown> = {}) => resetFake({
  user: COACH,
  tables: { player_teams: [], teams: [], players: [{ id: 'p1', user_id: 'u-p', coach_id: COACH.id, guardian_id: null, team_id: null, age_group: null, age_band: null, age_band_coach: null, age_band_self: null, ...row }] },
})

test('setPlayerAgeBand: the player\'s coach sets 18+ -> stored with the 18+ confirmation', async () => {
  seedCoach()
  assert.deepEqual(await setPlayerAgeBand('p1', '18_plus'), { success: true, band: '18_plus', youngerKept: false })
  assert.equal(p1().age_band_coach, '18_plus')
  assert.equal(p1().adult_confirmed_by, COACH.id)
  assert.ok(p1().age_confirmed_at)
})

test('setPlayerAgeBand: the player answered 13 to 17 -> coach 18+ keeps 13 to 17 and says so', async () => {
  seedCoach({ age_band_self: '13_17', age_band: '13_17' })
  assert.deepEqual(await setPlayerAgeBand('p1', '18_plus'), { success: true, band: '13_17', youngerKept: true })
  assert.equal(p1().adult_confirmed_at ?? null, null)
})

test('setPlayerAgeBand: under 13 is stored (video stays blocked)', async () => {
  seedCoach()
  const r = await setPlayerAgeBand('p1', 'under_13')
  assert.deepEqual(r, { success: true, band: 'under_13', youngerKept: false })
})

test('setPlayerAgeBand: another coach, the player themself, signed out, bad band -> refused, nothing written', async () => {
  seedCoach(); state.user = { id: 'other-coach' }
  assert.deepEqual(await setPlayerAgeBand('p1', '18_plus'), { error: 'Not authorized' })
  state.user = { id: 'u-p' }
  assert.deepEqual(await setPlayerAgeBand('p1', '18_plus'), { error: 'Not authorized' })
  state.user = null
  assert.deepEqual(await setPlayerAgeBand('p1', '18_plus'), { error: 'Not authenticated' })
  state.user = COACH
  assert.deepEqual(await setPlayerAgeBand('p1', 'adult'), { error: 'Choose an age band.' })
  assert.equal(p1().age_band_coach, null)
  assert.ok(!state.ops.some(o => o.action === 'update'))
})

test('setPlayerAgeBand: write fails -> error, not success', async () => {
  seedCoach()
  fail({ table: 'players', action: 'update', error: { message: 'boom' } })
  const r = await quiet(() => setPlayerAgeBand('p1', '13_17'))
  assert.equal((r as { error?: string }).error, "Couldn't save the player's age band. Please try again.")
})
