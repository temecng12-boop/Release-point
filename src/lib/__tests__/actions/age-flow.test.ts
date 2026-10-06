/**
 * Age bands (037) in the server actions:
 * - self-signup, one screen: the age is checked first; under 13 is a hard stop
 *   (no Supabase call, nothing stored or logged, a 24-hour cookie refuses every
 *   resubmission); Terms required;
 * - the same one screen for a signed-in player (confirmAgeAndTerms: invited or
 *   Google/Apple): one answer, Terms recorded once (history + profile); under
 *   13 freezes the account (band only, no name), signs out, sets the cookie;
 * - linkPlayerRow stores the signup band (younger answer wins);
 * - setPlayerAgeBand: the player's own coach only; the younger band is kept.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/age-flow.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { clientCalls, otpCalls, otpFake } from './fakes/supabase-server'
import { signUpPlayer, linkPlayerRow } from '../../../app/actions/auth'
import { confirmAgeAndTerms } from '../../../app/actions/age'
import { setPlayerAgeBand } from '../../../app/actions/player'
import { signSignupAge, verifySignupAge } from '../../signup-age-token'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

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

beforeEach(() => { resetFake(); otpCalls.length = 0; clientCalls.n = 0 })

// ── self-signup: the one screen ─────────────────────────────────────────────
const spyConsole = () => {
  const lines: string[] = []
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) console[k] = (...a: unknown[]) => { lines.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) }
  return { lines, restore: () => Object.assign(console, saved) }
}

test('signUpPlayer: under 13 -> stopped before any Supabase call; nothing stored or logged (no name, no email); 24-hour cookie', async () => {
  const spy = spyConsole()
  let r
  try { r = await signUpPlayer(undefined, signupForm(UNDER_13)) } finally { spy.restore() }
  assert.deepEqual(r, { stopped: true })
  assert.equal(clientCalls.n, 0, 'no Supabase client was even created')
  assert.equal(otpCalls.length, 0)
  assert.deepEqual(state.ops, [], 'no database call')
  assert.deepEqual(spy.lines, [], 'nothing logged')
  assert.equal(state.cookies.rp_age_stop?.value, '1')
  assert.deepEqual(state.cookies.rp_age_stop?.options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 86400 })
  assert.ok(!JSON.stringify(state).includes('p@example.com') && !JSON.stringify(state).toLowerCase().includes('pat lee'), 'name and email kept nowhere')
})

test('signUpPlayer: while the cookie is set, every resubmission is refused whatever the form says (back button, new date, no Terms, empty form)', async () => {
  await signUpPlayer(undefined, signupForm(UNDER_13))
  for (const form of [signupForm(ADULT), signupForm(TEEN), signupForm(ADULT, {}), fd({}), fd({ birth_month: '13', birth_year: 'x' })]) {
    assert.deepEqual(await signUpPlayer({ error: 'old state' }, form), { stopped: true })
  }
  assert.equal(otpCalls.length, 0)
  assert.equal(clientCalls.n, 0)
  assert.deepEqual(state.ops, [])
})

test('signUpPlayer: a cookie already set (another tab, a reload) refuses an adult answer before reading anything', async () => {
  state.cookies.rp_age_stop = { value: '1' }
  assert.deepEqual(await signUpPlayer(undefined, signupForm(ADULT)), { stopped: true })
  assert.equal(clientCalls.n, 0)
})

test('signUpPlayer: Terms not accepted, or no name -> error, no Supabase call', async () => {
  assert.equal((await signUpPlayer(undefined, signupForm(ADULT, {})))?.error, 'You must accept the Terms of Service to continue.')
  assert.equal((await signUpPlayer(undefined, fd({ ...ADULT, email: 'p@example.com', full_name: ' ', tos: 'yes' })))?.error, 'Enter your name.')
  assert.equal(otpCalls.length, 0)
  assert.equal(clientCalls.n, 0)
})

test('signUpPlayer: invalid birth month/year -> neutral error, no cookie, no call', async () => {
  for (const birth of [{ birth_month: '13', birth_year: '2000' }, { birth_month: '1', birth_year: String(Y + 1) }, {}]) {
    assert.equal((await signUpPlayer(undefined, signupForm(birth as Record<string, string>)))?.error, 'Enter your birth month and year.')
  }
  assert.equal(state.cookies.rp_age_stop, undefined)
  assert.equal(otpCalls.length, 0)
})

test('signUpPlayer: 13 to 17 -> the band travels only as a server-signed token bound to the email (no month/year, no plain age_band)', async () => {
  assert.deepEqual(await signUpPlayer(undefined, signupForm(TEEN)), { sent: true, email: 'p@example.com' })
  const data = (otpCalls[0].options as { data?: Record<string, unknown> }).data!
  assert.equal(data.role, 'player')
  assert.equal(data.full_name, 'Pat Lee')
  assert.equal('age_band' in data, false)
  assert.equal('tos_accepted_at' in data, false)
  const claims = verifySignupAge(data.signup_age, 'P@Example.com')
  assert.equal(claims?.band, '13_17')
  assert.equal(claims?.tosVersion, '2026-10-03')
  assert.equal(verifySignupAge(data.signup_age, 'other@example.com'), null, 'bound to the email')
  const decoded = Buffer.from(String(data.signup_age).split('.')[1], 'base64url').toString()
  assert.ok(!decoded.includes(TEEN.birth_year) && !JSON.stringify(data).includes(TEEN.birth_year), 'birth year is not stored')
})

test('signUpPlayer: the sign-in link fails -> friendly error, never the raw Supabase message', async () => {
  otpFake.error = { message: 'Email rate limit exceeded (raw)', code: 'over_email_send_rate_limit' }
  try {
    const r = await quiet(() => signUpPlayer(undefined, signupForm(ADULT)))
    assert.equal(r?.error, "We couldn't send your sign-in link. Check the email address and try again.")
  } finally { otpFake.error = null }
})

// ── the one screen for a signed-in player (confirmAgeAndTerms) ──────────────
const PU = { id: 'u-p', email: 'kid@example.com' }
const seedPlayer = (row: Record<string, unknown> = {}, extra: Record<string, unknown[]> = {}) => resetFake({
  user: PU,
  tables: {
    players: [{ id: 'p1', user_id: PU.id, coach_id: 'coach', guardian_id: null, team_id: null, age_group: null, full_name: 'Kid From Coach',
      age_band: null, age_band_coach: null, age_band_self: null, age_screen_at: null, age_confirmed_at: null,
      adult_confirmed_at: null, consent_given_at: null, ...row }],
    profiles: [{ id: PU.id, role: 'player', full_name: 'Kid From Coach', tos_accepted_at: null, tos_version: null }],
    terms_acceptances: [],
    player_teams: [], teams: [], ...extra,
  },
})
const p1 = () => state.tables.players[0]
const prof = () => state.tables.profiles[0]
const screen = (birth: Record<string, string>, extra: Record<string, string> = { tos: 'yes', full_name: 'kid lee' }) => fd({ ...birth, ...extra })

test('confirmAgeAndTerms: invited player, one step: band, screen done, Terms on profile + one history row, name saved', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus', age_confirmed_at: 'x' })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(ADULT)), { done: true })
  assert.equal(p1().age_band_self, '18_plus')
  assert.equal(p1().age_band, '18_plus')
  assert.ok(p1().age_screen_at)
  assert.ok(prof().tos_accepted_at)
  assert.equal(prof().tos_version, '2026-10-03')
  assert.equal(state.tables.terms_acceptances.length, 1)
  assert.deepEqual({ ...state.tables.terms_acceptances[0], id: 'x', accepted_at: 'x' }, { id: 'x', user_id: PU.id, tos_version: '2026-10-03', accepted_at: 'x' })
  assert.equal(p1().full_name, 'Kid Lee'); assert.equal(prof().full_name, 'Kid Lee')
  assert.ok(!JSON.stringify(state.tables).includes(ADULT.birth_year), 'birth year not stored')
})

test('confirmAgeAndTerms: player answer younger than the coach\'s -> the younger band wins', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus', age_confirmed_at: 'x' })
  await confirmAgeAndTerms(undefined, screen(TEEN))
  assert.equal(p1().age_band, '13_17')
  assert.equal(p1().age_band_source, 'self')
  assert.equal(p1().adult_confirmed_at ?? null, null, '18+ confirmation cleared to match')
})

test('confirmAgeAndTerms: only one answer; a second is refused, the band and Terms never change', async () => {
  seedPlayer({ age_band_coach: '13_17', age_band: '13_17' })
  await confirmAgeAndTerms(undefined, screen(TEEN))
  const before = structuredClone({ band: p1().age_band, self: p1().age_band_self, at: p1().age_screen_at, tos: prof().tos_accepted_at, history: state.tables.terms_acceptances.length })
  const r = await confirmAgeAndTerms(undefined, screen(ADULT))
  assert.match(String(r?.error), /already answered/)
  assert.deepEqual({ band: p1().age_band, self: p1().age_band_self, at: p1().age_screen_at, tos: prof().tos_accepted_at, history: state.tables.terms_acceptances.length }, before)
})

test('confirmAgeAndTerms: under 13 -> account frozen (only the band kept), no name or Terms saved, signed out, cookie set; retries stopped', async () => {
  seedPlayer({ age_band_coach: '13_17', age_band: '13_17', age_confirmed_at: 'x' })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(UNDER_13, { tos: 'yes', full_name: 'Real Child Name' })), { stopped: true })
  assert.equal(p1().age_band_self, 'under_13')
  assert.equal(p1().age_band, 'under_13')
  assert.equal(p1().full_name, 'Kid From Coach', 'the typed name is not saved')
  assert.ok(!JSON.stringify(state.tables).includes('Real Child Name'))
  assert.ok(!JSON.stringify(p1()).includes(UNDER_13.birth_year), 'birth year not stored')
  assert.equal(prof().tos_accepted_at, null)
  assert.equal(state.tables.terms_acceptances.length, 0)
  assert.equal(state.signOuts, 1)
  assert.deepEqual(state.cookies.rp_age_stop?.options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 86400 })
  const ops = state.ops.length
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(ADULT)), { stopped: true })
  assert.deepEqual(await confirmAgeAndTerms(undefined, fd({})), { stopped: true })
  assert.equal(state.ops.length, ops, 'nothing read or written after the stop')
})

test('confirmAgeAndTerms: under 13 still signs out and stops if the write fails (and logs it)', async () => {
  seedPlayer()
  fail({ table: 'players', action: 'update', error: { message: 'boom' } })
  assert.deepEqual(await quiet(() => confirmAgeAndTerms(undefined, screen(UNDER_13))), { stopped: true })
  assert.equal(state.signOuts, 1)
  assert.ok(state.cookies.rp_age_stop)
})

test('confirmAgeAndTerms: Google/Apple account with no players row, 13 to 17 -> own row with band, name and email; Terms recorded', async () => {
  resetFake({ user: PU, tables: { players: [], profiles: [{ id: PU.id, role: 'player', full_name: 'G User', tos_accepted_at: null }], terms_acceptances: [], player_teams: [], teams: [] } })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(TEEN)), { done: true })
  const row = state.tables.players[0]
  assert.equal(row.user_id, PU.id); assert.equal(row.age_band, '13_17'); assert.equal(row.age_band_self, '13_17')
  assert.ok(row.age_screen_at); assert.equal(row.full_name, 'Kid Lee'); assert.equal(row.email, PU.email)
  assert.equal(state.tables.terms_acceptances.length, 1)
})

test('confirmAgeAndTerms: Google/Apple account with no players row, under 13 -> frozen row with the band only (no name, no email)', async () => {
  resetFake({ user: PU, tables: { players: [], profiles: [{ id: PU.id, role: 'player', full_name: 'G User' }], terms_acceptances: [], player_teams: [], teams: [] } })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(UNDER_13)), { stopped: true })
  const row = state.tables.players[0]
  assert.equal(row.age_band_self, 'under_13'); assert.equal(row.full_name, ''); assert.equal(row.email, null)
  const { isFrozenUnder13 } = await import('../../consent')
  assert.equal(isFrozenUnder13(row as never), true, 'the account stays frozen on every device')
})

test('confirmAgeAndTerms: Terms not accepted, or no name -> error, nothing written', async () => {
  seedPlayer()
  assert.equal((await confirmAgeAndTerms(undefined, screen(ADULT, { full_name: 'Kid' })))?.error, 'You must accept the Terms of Service to continue.')
  assert.equal((await confirmAgeAndTerms(undefined, screen(ADULT, { tos: 'yes', full_name: '  ' })))?.error, 'Enter your name.')
  assert.ok(!state.ops.some((o) => o.action !== 'select'))
})

test('confirmAgeAndTerms: the band write fails -> error, not done, screen still due (Terms kept, once)', async () => {
  seedPlayer()
  fail({ table: 'players', action: 'update', error: { message: 'boom' }, when: () => true })
  const r = await quiet(() => confirmAgeAndTerms(undefined, screen(ADULT)))
  assert.equal(r?.error, "We couldn't save your answer. Please try again.")
  assert.equal(p1().age_screen_at, null)
})

test('confirmAgeAndTerms: the Terms history write fails -> error, no band and no profile Terms saved', async () => {
  seedPlayer()
  fail({ table: 'terms_acceptances', action: 'insert', error: { message: 'boom', code: '500' } })
  const r = await quiet(() => confirmAgeAndTerms(undefined, screen(ADULT)))
  assert.equal(r?.error, "We couldn't save your answer. Please try again.")
  assert.equal(p1().age_screen_at, null); assert.equal(prof().tos_accepted_at, null)
})

test('confirmAgeAndTerms: before 039 (no terms_acceptances table) the profile still records the Terms', async () => {
  seedPlayer()
  fail({ table: 'terms_acceptances', action: 'insert', error: { message: 'relation "public.terms_acceptances" does not exist', code: '42P01' } })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(ADULT)), { done: true })
  assert.ok(prof().tos_accepted_at)
})

test('confirmAgeAndTerms: player on a "Youth 10-12" team answering 18+ -> under 13; a grade-range "9-12" team doesn\'t count', async () => {
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus' }, { player_teams: [{ player_id: 'p1', team_id: 't' }], teams: [{ id: 't', age_group: 'Youth 10-12' }] })
  await confirmAgeAndTerms(undefined, screen(ADULT))
  assert.equal(p1().age_band, 'under_13')
  seedPlayer({ age_band_coach: '18_plus', age_band: '18_plus' }, { player_teams: [{ player_id: 'p1', team_id: 't' }], teams: [{ id: 't', age_group: '9-12' }] })
  await confirmAgeAndTerms(undefined, screen(ADULT))
  assert.equal(p1().age_band, '18_plus')
})

test('confirmAgeAndTerms: player with no coach confirms once (13 to 17)', async () => {
  seedPlayer({ coach_id: null })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(TEEN)), { done: true })
  assert.equal(p1().age_band, '13_17')
  assert.ok(p1().age_confirmed_at)
})

test('confirmAgeAndTerms: signed out -> error', async () => {
  seedPlayer(); state.user = null
  assert.equal((await confirmAgeAndTerms(undefined, screen(ADULT)))?.error, 'Your session has expired. Sign in again.')
})

// ── linkPlayerRow ───────────────────────────────────────────────────────────
const AT = new Date().toISOString()
const token = (band: '13_17' | '18_plus' | 'under_13', email = PU.email) => signSignupAge(email, { band, answeredAt: AT, tosAcceptedAt: AT, tosVersion: '2026-10-03' })

test('linkPlayerRow: new self-signup with a signed answer gets a row with its band, ToS time and version', async () => {
  resetFake({ user: { ...PU, user_metadata: { role: 'player', full_name: 'Kid', signup_age: token('13_17') } }, tables: { players: [], profiles: [] } })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  const row = state.tables.players[0]
  assert.equal(row.age_band_self, '13_17')
  assert.equal(row.age_band, '13_17')
  assert.equal(row.age_screen_at, AT)
  assert.equal(state.tables.profiles[0].role, 'player')
  assert.equal(state.tables.profiles[0].tos_accepted_at, AT)
  assert.equal(state.tables.profiles[0].tos_version, '2026-10-03')
  assert.deepEqual(state.tables.terms_acceptances.map((r) => ({ user_id: r.user_id, tos_version: r.tos_version, accepted_at: r.accepted_at })), [{ user_id: PU.id, tos_version: '2026-10-03', accepted_at: AT }], 'Terms history row')
  const { needsAgeConfirm } = await import('../../consent')
  assert.equal(needsAgeConfirm(row as never), false, 'confirmed once at signup: no screen afterwards')
})

for (const [label, meta] of [
  ['plain age_band 18_plus', { age_band: '18_plus', age_screen_at: AT, tos_accepted_at: AT }],
  ['old adult_confirmed: true', { adult_confirmed: true }],
  ['a token signed for another email', { signup_age: 'later' }],
  ['a tampered token (band changed)', { signup_age: 'tamper' }],
  ['a token with a made-up signature', { signup_age: 'v1.eyJlIjoia2lkQGV4YW1wbGUuY29tIiwiYmFuZCI6IjE4X3BsdXMifQ.AAAA' }],
] as const) {
  test(`linkPlayerRow: forged metadata (${label}) sets no band and no ToS; the one screen asks instead`, async () => {
    let m: Record<string, unknown> = { ...meta }
    if (m.signup_age === 'later') m = { signup_age: token('18_plus', 'someone@example.com') }
    if (m.signup_age === 'tamper') {
      const [v, body, sig] = token('13_17')!.split('.')
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
      m = { signup_age: `${v}.${Buffer.from(JSON.stringify({ ...claims, band: '18_plus' })).toString('base64url')}.${sig}` }
    }
    resetFake({ user: { ...PU, user_metadata: { role: 'player', full_name: 'Kid', ...m } }, tables: { players: [], profiles: [] } })
    assert.deepEqual(await linkPlayerRow(), { success: true })
    const row = state.tables.players[0]
    for (const c of ['age_band', 'age_band_self', 'age_screen_at', 'adult_confirmed_at']) assert.equal(row[c] ?? null, null, c)
    assert.equal(state.tables.profiles[0].tos_accepted_at ?? null, null)
    const { needsAgeConfirm } = await import('../../consent')
    assert.equal(needsAgeConfirm(row as never), true, 'gets the one screen on the first visit')
  })
}

test('linkPlayerRow: forged 18+ metadata on an invited row leaves the coach\'s answer alone', async () => {
  resetFake({
    user: { ...PU, user_metadata: { role: 'player', age_band: '18_plus', signup_age: token('18_plus', 'x@example.com') } },
    tables: { profiles: [], player_teams: [], teams: [], players: [{ id: 'p1', email: PU.email, user_id: null, coach_id: 'coach', guardian_id: null, team_id: null, age_group: null, age_band_coach: '13_17', age_band: '13_17', age_band_self: null, age_screen_at: null }] },
  })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(p1().age_band, '13_17'); assert.equal(p1().age_band_self, null); assert.equal(p1().age_screen_at, null)
})

test('signed tokens expire after 7 days', () => {
  const old = signSignupAge(PU.email, { band: '18_plus', answeredAt: new Date(Date.now() - 8 * 864e5).toISOString(), tosAcceptedAt: AT, tosVersion: 'x' })
  assert.equal(verifySignupAge(old, PU.email), null)
  assert.equal(verifySignupAge(token('18_plus'), PU.email)?.band, '18_plus')
})

test('linkPlayerRow: invited email signing up as 13 to 17 when the coach said 18+ -> 13 to 17', async () => {
  resetFake({
    user: { ...PU, user_metadata: { role: 'player', signup_age: token('13_17') } },
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

test('confirmAgeAndTerms: a Youth team with no band yet -> the player\'s 13 to 17 answer stands (known band says otherwise)', async () => {
  seedPlayer({ age_band: 'under_13', age_band_source: 'age_group', age_confirmed_at: '2026-10-01T00:00:00Z' }, { player_teams: [{ player_id: 'p1', team_id: 't' }], teams: [{ id: 't', age_group: 'Youth' }] })
  const { needsAgeConfirm, isFrozenUnder13 } = await import('../../consent')
  assert.equal(isFrozenUnder13(p1() as never), false)
  assert.equal(needsAgeConfirm(p1() as never), true)
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(TEEN)), { done: true })
  assert.equal(p1().age_band, '13_17')
})

test('confirmAgeAndTerms: Youth team, coachless, no band -> may still answer once', async () => {
  seedPlayer({ coach_id: null, age_band: 'under_13', age_band_source: 'age_group', age_confirmed_at: '2026-10-01T00:00:00Z', age_group: 'Youth' })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen(ADULT)), { done: true })
  assert.equal(p1().age_band, '18_plus')
})

test('POST /auth/signout (the frozen account\'s sign-out; no server action needed) signs out and goes to sign-in', async () => {
  const { POST } = await import('../../../app/auth/signout/route')
  const { NextRequest } = await import('next/server')
  seedPlayer()
  const r = await POST(new NextRequest('https://releasepointai.com/auth/signout', { method: 'POST' }))
  assert.equal(r.status, 303)
  assert.equal(r.headers.get('location'), 'https://releasepointai.com/auth/login')
  assert.equal(state.signOuts, 1)
  const { readFileSync } = await import('node:fs')
  const page = readFileSync(new URL('../../../app/under-13/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /<AgeStopNotice \/>/)
  assert.match(page, /action=\{SIGN_OUT_ROUTE\} method="post"/)
})
