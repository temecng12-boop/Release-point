/**
 * Google/Apple signup and the under-13 freeze (age follow-ups):
 * - startOAuthSignup: the birth month/year and Terms come before the Google
 *   and Apple buttons; under 13 stops with no Supabase call and no OAuth;
 *   13+ gets a signed 15-minute cookie the OAuth callback stores once;
 * - applyOAuthSignupAge (OAuth callback): stores that answer and the Terms
 *   once, so the age screen isn't shown again;
 * - the /onboarding/age fallback: an under-13 answer freezes the account,
 *   blanks the profile (no name left anywhere), deletes the photo, removes
 *   the provider's name and photo from the auth user, marks it for deletion;
 * - the coach signup refuses while the 24-hour stop cookie is set;
 * - the dashboard / age page loop can't happen.
 * Run with: TSX_TSCONFIG_PATH=src/lib/__tests__/actions/tsconfig.json npx tsx --test src/lib/__tests__/actions/oauth-age-freeze.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resetFake, fail, state } from './fakes/db'
import { clientCalls, signUpCalls } from './fakes/supabase-server'
import { authAdmin } from './fakes/supabase-admin'
import { RedirectSignal } from './fakes/next-navigation'
import { signUp, startOAuthSignup } from '../../../app/actions/auth'
import { confirmAgeAndTerms } from '../../../app/actions/age'
import { applyOAuthSignupAge, rescrubFrozenAccount } from '../../oauth-signup-age'
import { freezeUnder13Account, PROVIDER_METADATA_KEYS } from '../../under13-freeze'
import { OAUTH_AGE_COOKIE, signOAuthAge, verifyOAuthAge } from '../../signup-age-token'
import { needsAgeConfirm } from '../../consent'
import { agePageRoute, dashboardRoute, type Read } from '../../age-gate-routing'
import AgeConfirmPage from '../../../app/onboarding/age/page'
import DashboardPage from '../../../app/dashboard/page'
import AccountLoadError from '../../../components/account-load-error'
import AgeStopNotice from '../../../components/age-stop-notice'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const Y = new Date().getFullYear()
const UNDER_13 = { birth_month: '1', birth_year: String(Y - 6) }
const TEEN = { birth_month: '1', birth_year: String(Y - 15) }
const ADULT = { birth_month: '1', birth_year: '1990' }
const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f }
const spyConsole = () => {
  const lines: string[] = []
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) console[k] = (...a: unknown[]) => { lines.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) }
  return { lines, restore: () => Object.assign(console, saved) }
}
const quiet = async <R>(fn: () => Promise<R>) => { const s = spyConsole(); try { return await fn() } finally { s.restore() } }

const UID = '11111111-1111-4111-8111-111111111111'
const NAME = 'Riley Grant'
const EMAIL = 'riley.g@gmail.com'
const PROVIDER_META = { full_name: NAME, name: NAME, given_name: 'Riley', family_name: 'Grant', avatar_url: 'https://lh3.googleusercontent.com/a/x', picture: 'https://lh3.googleusercontent.com/a/x', email: EMAIL, email_verified: true, sub: '1234', iss: 'https://accounts.google.com' }
const oauthUser = { id: UID, email: EMAIL, user_metadata: PROVIDER_META }
/** A Google sign-up: the auth user and a profile with the provider's name exist before any age answer. */
const googleAccount = (extra: Record<string, unknown[]> = {}) => resetFake({
  user: oauthUser,
  tables: {
    profiles: [{ id: UID, role: 'player', full_name: NAME, avatar_url: `avatars/${UID}.jpg`, bio: 'Lefty from Fresno', location: 'Fresno', team_name: null, certifications: [] }],
    players: [], terms_acceptances: [],
    ...extra,
  } as never,
  storage: { clips: [`avatars/${UID}.jpg`, 'avatars/22222222-2222-4222-8222-222222222222.jpg', `${UID}/clip.mp4`], profiles: [`avatars/${UID}.png`] },
})

beforeEach(() => { resetFake(); clientCalls.n = 0; signUpCalls.length = 0; authAdmin.reset() })

// ── 1a. Signup page: birth month/year before the Google and Apple buttons ───
test('startOAuthSignup: under 13 -> stopped, 24-hour cookie, no Supabase call, no OAuth cookie, nothing logged', async () => {
  const spy = spyConsole()
  let r
  try { r = await startOAuthSignup(undefined, fd({ ...UNDER_13, tos: 'yes' })) } finally { spy.restore() }
  assert.deepEqual(r, { stopped: true })
  assert.equal(clientCalls.n, 0, 'no Supabase client created (no OAuth can start)')
  assert.deepEqual(state.ops, [])
  assert.deepEqual(spy.lines, [])
  assert.equal(state.cookies.rp_age_stop?.value, '1')
  assert.equal(state.cookies[OAUTH_AGE_COOKIE], undefined, 'no token: the buttons never show')
})

test('startOAuthSignup: while the stop cookie is set every answer is refused (back button, new date)', async () => {
  await startOAuthSignup(undefined, fd({ ...UNDER_13, tos: 'yes' }))
  for (const f of [fd({ ...ADULT, tos: 'yes' }), fd({ ...TEEN, tos: 'yes' }), fd({})]) assert.deepEqual(await startOAuthSignup({ ready: true }, f), { stopped: true })
  assert.equal(state.cookies[OAUTH_AGE_COOKIE], undefined)
  assert.equal(clientCalls.n, 0)
})

test('startOAuthSignup: 13 or older with the Terms -> ready, a signed 15-minute httpOnly cookie with the band and Terms; no Supabase call', async () => {
  const r = await startOAuthSignup(undefined, fd({ ...TEEN, tos: 'yes' }))
  assert.deepEqual(r, { ready: true })
  assert.equal(clientCalls.n, 0); assert.deepEqual(state.ops, [])
  const c = state.cookies[OAUTH_AGE_COOKIE]
  assert.deepEqual(c.options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 })
  const claims = verifyOAuthAge(c.value)
  assert.equal(claims?.band, '13_17'); assert.equal(claims?.tosVersion, '2026-10-03'); assert.ok(claims?.tosAcceptedAt)
})

test('startOAuthSignup: no Terms or a bad date -> error, no cookie', async () => {
  assert.equal((await startOAuthSignup(undefined, fd(ADULT)))?.error, 'You must accept the Terms of Service to continue.')
  assert.equal((await startOAuthSignup(undefined, fd({ birth_month: '', birth_year: '', tos: 'yes' })))?.error, 'Enter your birth month and year.')
  assert.equal(state.cookies[OAUTH_AGE_COOKIE], undefined)
})

test('OAuth age token: never signed for under 13; tampered, forged, expired or email-link tokens are rejected', () => {
  const now = new Date().toISOString()
  assert.equal(signOAuthAge({ band: 'under_13', answeredAt: now, tosAcceptedAt: now, tosVersion: 'v' }), null)
  const t = signOAuthAge({ band: '18_plus', answeredAt: now, tosAcceptedAt: now, tosVersion: '2026-10-03' })!
  assert.equal(verifyOAuthAge(t)?.band, '18_plus')
  const [v, body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ band: '18_plus', answeredAt: now, tosAcceptedAt: now, tosVersion: 'x' })).toString('base64url')
  assert.equal(verifyOAuthAge(`${v}.${forged}.${sig}`), null, 'body swapped')
  assert.equal(verifyOAuthAge(`${v}.${body}.${sig.slice(0, -2)}xx`), null, 'bad signature')
  assert.equal(verifyOAuthAge(t, Date.now() + 16 * 60 * 1000), null, 'older than 15 minutes')
  assert.equal(verifyOAuthAge('v1.' + body + '.' + sig), null, 'other token kind')
  assert.equal(verifyOAuthAge(undefined), null)
})

test('applyOAuthSignupAge: a new Google account stores the band and Terms once; the age screen is not shown again', async () => {
  googleAccount()
  const token = signOAuthAge({ band: '13_17', answeredAt: new Date().toISOString(), tosAcceptedAt: '2026-10-05T10:00:00.000Z', tosVersion: '2026-10-03' })
  assert.equal(await applyOAuthSignupAge((await import('./fakes/supabase-admin')).supabaseAdmin, oauthUser, token), 'stored')
  const row = state.tables.players[0]
  assert.equal(row.user_id, UID); assert.equal(row.age_band_self, '13_17'); assert.ok(row.age_screen_at)
  assert.equal(needsAgeConfirm(row as never), false, 'no second age screen')
  assert.equal(state.tables.profiles[0].tos_accepted_at, '2026-10-05T10:00:00.000Z')
  assert.equal(state.tables.profiles[0].tos_version, '2026-10-03')
  assert.equal(state.tables.terms_acceptances.length, 1)
  // Replay of the same cookie: already answered, nothing new written.
  const before = JSON.stringify(state.tables)
  assert.equal(await applyOAuthSignupAge((await import('./fakes/supabase-admin')).supabaseAdmin, oauthUser, token), 'already_answered')
  assert.equal(JSON.stringify(state.tables), before)
})

test('applyOAuthSignupAge: an invited player (linked first) keeps the younger answer; a coach or a bad token stores nothing', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  googleAccount({ players: [{ id: 'p1', user_id: UID, coach_id: 'c1', full_name: 'Riley G', age_band_coach: '18_plus', age_band: '18_plus', age_band_source: 'coach', age_confirmed_at: '2026-10-01T00:00:00Z', age_screen_at: null, age_band_self: null }] })
  const token = signOAuthAge({ band: '13_17', answeredAt: new Date().toISOString(), tosAcceptedAt: new Date().toISOString(), tosVersion: '2026-10-03' })
  assert.equal(await applyOAuthSignupAge(supabaseAdmin, oauthUser, token), 'stored')
  assert.equal(state.tables.players[0].age_band, '13_17', 'younger answer wins')
  googleAccount(); state.tables.profiles[0].role = 'coach'
  assert.equal(await applyOAuthSignupAge(supabaseAdmin, oauthUser, token), 'not_player')
  assert.equal(await applyOAuthSignupAge(supabaseAdmin, oauthUser, 'o1.x.y'), 'invalid')
  assert.equal(await applyOAuthSignupAge(supabaseAdmin, oauthUser, undefined), 'no_token')
  assert.equal(state.tables.players.length, 0); assert.equal(state.tables.terms_acceptances.length, 0)
})

test('OAuth callback: links invites, then stores the signup answer from the cookie once and clears it; re-scrubs a frozen account', () => {
  const src = readFileSync(new URL('../../../app/auth/callback/route.ts', import.meta.url), 'utf8')
  const i = (s: string) => { const n = src.indexOf(s); assert.ok(n >= 0, s); return n }
  assert.ok(i(".is('user_id', null)") < i('cookieStore.get(OAUTH_AGE_COOKIE)'), 'invite linked before the answer is stored')
  assert.ok(i('cookieStore.get(OAUTH_AGE_COOKIE)') < i('cookieStore.delete(OAUTH_AGE_COOKIE)'))
  assert.ok(i('cookieStore.delete(OAUTH_AGE_COOKIE)') < i('applyOAuthSignupAge(supabaseAdmin, user, oauthAge)'))
  assert.match(src, /if \(code\) await rescrubFrozenAccount\(supabaseAdmin, user\.id\)/)
})

// ── 1b. /onboarding/age fallback: under 13 freezes and blanks the account ──
const noNameLeft = () => {
  const blob = JSON.stringify({ tables: state.tables, storage: state.storage }).toLowerCase()
  assert.ok(!blob.includes('riley') && !blob.includes('grant') && !blob.includes('fresno'), `no name or profile data left: ${blob.slice(0, 400)}`)
}

test('fallback: an under-13 answer on /onboarding/age (Google from the sign-in page) freezes, blanks, deletes the photo, scrubs the auth metadata, marks for deletion', async () => {
  googleAccount()
  const spy = spyConsole()
  let r
  try { r = await confirmAgeAndTerms(undefined, fd({ ...UNDER_13, full_name: NAME, tos: 'yes' })) } finally { spy.restore() }
  assert.deepEqual(r, { stopped: true })
  assert.equal(state.cookies.rp_age_stop?.value, '1')
  assert.equal(state.signOuts, 1)
  // Freeze
  const row = state.tables.players[0]
  assert.equal(row.age_band_self, 'under_13'); assert.equal(row.full_name, ''); assert.equal(row.email, null)
  // Profile: only id, role and the freeze marks keep a value
  const p = state.tables.profiles[0]
  assert.equal(p.id, UID); assert.equal(p.role, 'player')
  for (const c of ['full_name', 'avatar_url', 'bio', 'location', 'team_name', 'college', 'playing_career', 'coaching_since', 'social_twitter', 'social_instagram', 'social_linkedin']) assert.equal(p[c], null, c)
  assert.deepEqual(p.certifications, [])
  assert.ok(p.frozen_at && p.deletion_requested_at, 'frozen and marked for deletion')
  assert.equal(p.tos_accepted_at ?? null, null, 'no Terms recorded')
  // Photo files gone (own files only)
  assert.deepEqual(state.storage.clips.sort(), [`${UID}/clip.mp4`, 'avatars/22222222-2222-4222-8222-222222222222.jpg'].sort())
  assert.deepEqual(state.storage.profiles, [])
  // Provider name and photo removed from the auth user; the email is kept
  assert.equal(authAdmin.metadataUpdates.length, 1)
  const meta = authAdmin.metadataUpdates[0]
  assert.equal(meta.id, UID)
  for (const k of ['full_name', 'name', 'given_name', 'family_name', 'avatar_url', 'picture']) assert.equal(meta.user_metadata[k], null, k)
  assert.ok(!('email' in meta.user_metadata), 'the email stays')
  assert.ok(PROVIDER_METADATA_KEYS.every((k) => meta.user_metadata[k] === null))
  noNameLeft()
  assert.ok(!spy.lines.join(' ').toLowerCase().includes('riley') && !spy.lines.join(' ').includes(EMAIL), 'no name or email logged')
})

test('fallback: an invited player under 13 keeps the coach\'s roster entry; the profile is still blanked', async () => {
  googleAccount({ players: [{ id: 'p1', user_id: UID, coach_id: 'c1', full_name: 'Riley G (coach entered)', email: EMAIL, age_band_coach: null, age_band: null, age_screen_at: null, age_band_self: null }] })
  await quiet(() => confirmAgeAndTerms(undefined, fd({ ...UNDER_13, full_name: NAME, tos: 'yes' })))
  assert.equal(state.tables.players[0].full_name, 'Riley G (coach entered)', "the coach's roster entry stays")
  assert.equal(state.tables.players[0].age_band_self, 'under_13')
  assert.equal(state.tables.profiles[0].full_name, null)
  assert.ok(state.tables.profiles[0].deletion_requested_at)
})

test('freeze: if the freeze itself can\'t be stored, nothing is blanked (no half-done account)', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  googleAccount()
  fail({ table: 'players', action: 'insert', error: { code: '57014', message: 'timeout' } })
  const r = await quiet(() => freezeUnder13Account(supabaseAdmin, UID))
  assert.deepEqual(r, { ok: false, failed: ['band'] })
  assert.equal(state.tables.profiles[0].full_name, NAME)
  assert.equal(authAdmin.metadataUpdates.length, 0)
})

test('freeze: a later step failing is reported, the others still run; before migration 040 the profile is still blanked', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  googleAccount()
  authAdmin.updateError = { message: 'boom' }
  fail({ table: 'profiles', action: 'update', error: { code: 'PGRST204', message: "Could not find the 'frozen_at' column of 'profiles'" },
    when: () => { const op = state.ops.at(-1); return !!op && op.table === 'profiles' && op.action === 'update' && 'frozen_at' in (op.values as object) } })
  fail({ table: 'profiles', action: 'update', error: { code: 'PGRST204', message: "Could not find the 'deletion_requested_at' column of 'profiles'" },
    when: () => { const op = state.ops.at(-1); return !!op && op.table === 'profiles' && op.action === 'update' && 'deletion_requested_at' in (op.values as object) } })
  const r = await quiet(() => freezeUnder13Account(supabaseAdmin, UID))
  assert.deepEqual(r, { ok: false, failed: ['metadata'] })
  assert.equal(state.tables.profiles[0].full_name, null)
  assert.equal(state.tables.profiles[0].frozen_at ?? null, null, 'no column before 040')
  assert.deepEqual(state.storage.profiles, [])
})

test('freeze: an account that already answered 13 or older is never blanked', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  googleAccount({ players: [{ id: 'p1', user_id: UID, coach_id: null, full_name: NAME, age_band_self: '18_plus', age_band: '18_plus', age_screen_at: '2026-10-01T00:00:00Z', age_confirmed_at: '2026-10-01T00:00:00Z' }] })
  const r = await quiet(() => freezeUnder13Account(supabaseAdmin, UID))
  assert.deepEqual(r, { ok: false, failed: ['band'] })
  assert.equal(state.tables.profiles[0].full_name, NAME)
  assert.equal(state.tables.players[0].age_band, '18_plus')
})

test('rescrubFrozenAccount: a frozen account signing in again loses the provider name again; others untouched', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  googleAccount({ players: [{ id: 'p1', user_id: UID, coach_id: null, full_name: '', age_band_self: 'under_13', age_band: 'under_13', age_screen_at: '2026-10-01T00:00:00Z', age_confirmed_at: '2026-10-01T00:00:00Z' }] })
  assert.equal(await rescrubFrozenAccount(supabaseAdmin, UID), true)
  assert.equal(authAdmin.metadataUpdates.length, 1)
  state.tables.players[0].age_band_self = '18_plus'; state.tables.players[0].age_band = '18_plus'
  assert.equal(await rescrubFrozenAccount(supabaseAdmin, UID), false)
  assert.equal(authAdmin.metadataUpdates.length, 1)
})

test('age page: the stop cookie with an unanswered player account signed in (Google right after an under-13 answer) freezes and blanks it', async () => {
  googleAccount()
  state.cookies.rp_age_stop = { value: '1' }
  const el = await quiet(() => AgeConfirmPage()) as { props: { children: { type: unknown } } }
  assert.equal(el.props.children.type, AgeStopNotice)
  assert.equal(state.tables.players[0].age_band_self, 'under_13')
  assert.equal(state.tables.profiles[0].full_name, null)
  noNameLeft()
})

test('age page: the stop cookie never touches an account that already answered, or a coach', async () => {
  googleAccount({ players: [{ id: 'p1', user_id: UID, coach_id: null, full_name: NAME, age_band_self: '18_plus', age_band: '18_plus', age_screen_at: '2026-10-01T00:00:00Z', age_confirmed_at: '2026-10-01T00:00:00Z' }] })
  state.cookies.rp_age_stop = { value: '1' }
  await quiet(() => AgeConfirmPage())
  assert.equal(state.tables.profiles[0].full_name, NAME)
  googleAccount(); state.tables.profiles[0].role = 'coach'; state.cookies.rp_age_stop = { value: '1' }
  await quiet(() => AgeConfirmPage())
  assert.equal(state.tables.profiles[0].full_name, NAME)
  assert.equal(state.tables.players.length, 0)
})

// ── 4. Coach signup and the stop cookie ────────────────────────────────────
test('coach signUp: refused while the 24-hour stop cookie is set, before any Supabase call; the form shows the stop message', async () => {
  state.cookies.rp_age_stop = { value: '1' }
  const r = await signUp(undefined, fd({ email: 'c@example.com', password: 'a-long-unusual-pass', full_name: 'Coach C', tos: 'on' }))
  assert.deepEqual(r, { stopped: true })
  assert.equal(clientCalls.n, 0); assert.equal(signUpCalls.length, 0); assert.deepEqual(state.ops, [])
  const form = readFileSync(new URL('../../../app/auth/signup/signup-form.tsx', import.meta.url), 'utf8')
  assert.match(form, /if \(state\?\.stopped\) return <AgeStopNotice \/>/)
})

test('coach signUp: without the cookie it still works', async () => {
  await assert.rejects(signUp(undefined, fd({ email: 'c@example.com', password: 'a-long-unusual-pass', full_name: 'coach c', tos: 'on' })), (e) => e instanceof RedirectSignal && e.url === '/dashboard')
  assert.equal(signUpCalls.length, 1)
})

// ── 2. The dashboard / age page loop ────────────────────────────────────────
type P = Read<{ role?: string | null }>
const T = '2026-10-01T00:00:00Z'
const profiles: [string, P][] = [
  ['read failed', { data: null, error: { message: 'timeout' } }], ['missing', { data: null, error: null }],
  ['player', { data: { role: 'player' }, error: null }], ['coach', { data: { role: 'coach' }, error: null }],
  ['guardian', { data: { role: 'guardian' }, error: null }], ['no role', { data: { role: null }, error: null }],
]
const players: [string, Read<Record<string, unknown>> | null][] = [
  ['not read', null], ['read failed', { data: null, error: { message: 'timeout' } }], ['no row', { data: null, error: null }],
  ['unanswered', { data: { age_screen_at: null, age_band: null }, error: null }],
  ['answered', { data: { age_screen_at: T, age_band: '13_17', age_confirmed_at: T }, error: null }],
  ['frozen', { data: { age_screen_at: T, age_band: 'under_13', age_band_self: 'under_13', age_confirmed_at: T }, error: null }],
]

test('loop: for every read result, the dashboard and the age page never send each other back and forth', () => {
  let cases = 0
  for (const [pn, p] of profiles) for (const [rn, r] of players) for (const cookie of [false, true]) {
    cases++
    const d = dashboardRoute(p, r as never), a = agePageRoute(cookie, p, r as never)
    assert.ok(!(d === 'age' && a === 'dashboard'), `loop: profile ${pn}, player ${rn}, cookie ${cookie}`)
    if (p.error || !p.data) { assert.equal(d, 'error', `dashboard ${pn}`); if (!cookie) assert.equal(a, 'error', `age page ${pn}`) }
    if (r?.error) assert.notEqual(d, 'age', 'a failed player read never redirects the dashboard')
  }
  assert.equal(cases, 72)
})

test('loop: profile read fails -> the dashboard and the age page both show the error (Try again / Sign out), no redirect', async () => {
  googleAccount()
  fail({ table: 'profiles', action: 'select', error: { code: '57014', message: 'canceling statement due to statement timeout' } })
  const d = await quiet(() => DashboardPage()) as { type: unknown; props: { retryHref: string } }
  assert.equal(d.type, AccountLoadError); assert.equal(d.props.retryHref, '/dashboard')
  const a = await quiet(() => AgeConfirmPage()) as { type: unknown; props: { retryHref: string } }
  assert.equal(a.type, AccountLoadError); assert.equal(a.props.retryHref, '/onboarding/age')
})

test('loop: a missing profile row -> error on both pages, no redirect; a coach on the age page goes to a dashboard that keeps them', async () => {
  googleAccount(); state.tables.profiles = []
  assert.equal(((await quiet(() => DashboardPage())) as { type: unknown }).type, AccountLoadError)
  assert.equal(((await quiet(() => AgeConfirmPage())) as { type: unknown }).type, AccountLoadError)
  googleAccount(); state.tables.profiles[0].role = 'coach'
  await assert.rejects(AgeConfirmPage(), (e) => e instanceof RedirectSignal && e.url === '/dashboard')
  // ...and the dashboard renders for the coach (no redirect to /onboarding/age).
  const el = await quiet(() => DashboardPage())
  assert.ok(el && (el as { type: unknown }).type !== AccountLoadError)
})

test('loop: a player row read failure -> the age page shows the error; the dashboard doesn\'t redirect', async () => {
  googleAccount()
  fail({ table: 'players', action: 'select', error: { code: '57014', message: 'timeout' } })
  assert.equal(((await quiet(() => AgeConfirmPage())) as { type: unknown }).type, AccountLoadError)
  const el = await quiet(() => DashboardPage().catch((e) => e))
  assert.ok(!(el instanceof RedirectSignal), `no redirect: ${el instanceof RedirectSignal ? el.url : ''}`)
})

test('loop: a confirmed unanswered player goes dashboard -> one screen, and the one screen shows the form (not back)', async () => {
  googleAccount()
  await assert.rejects(DashboardPage(), (e) => e instanceof RedirectSignal && e.url === '/onboarding/age')
  const el = await AgeConfirmPage() as { props: { children: unknown[] } }
  assert.ok(JSON.stringify(el.props.children, (_k, v) => (typeof v === 'function' ? v.name : v)).includes('"mode":"account"'))
})
