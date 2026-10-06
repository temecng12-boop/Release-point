/**
 * Early-access coach invites (slim v1): only platform admins can invite, the
 * invited coach gets their own account (never joins the inviter's roster),
 * existing accounts are never double-created, and public signup stays a
 * waitlist holding page.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/coach-invite.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { inviteCoach } from '../../../app/actions/coach-invites'
import { acceptCoachInvite } from '../../coach-invite-accept'
import { isPlatformAdmin, isValidInviteEmail, normalizeInviteEmail, platformAdminEmails } from '../../platform-admin'

const ADMIN = { id: 'admin-1', email: 'temecng12@gmail.com' }
const COACH = { id: 'coach-1', email: 'coach@example.com' }
const CASEY = 'caseyspencer2021@gmail.com'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const inviteForm = (email = 'newcoach@example.com', name = 'New Coach') =>
  form({ coach_email: email, full_name: name })

const tables = () => ({
  profiles: [{ id: ADMIN.id, role: 'coach', full_name: 'Nolan', is_platform_admin: true }],
  coach_invites: [] as Record<string, unknown>[],
  players: [] as Record<string, unknown>[],
  guardians: [] as Record<string, unknown>[],
  teams: [] as Record<string, unknown>[],
  team_coaches: [] as Record<string, unknown>[],
  terms_acceptances: [] as Record<string, unknown>[],
})

const savedEnv = process.env.PLATFORM_ADMIN_EMAILS
beforeEach(() => {
  resetFake({ tables: tables(), user: ADMIN })
  authAdmin.reset()
  emailFake.reset()
  delete process.env.PLATFORM_ADMIN_EMAILS
})
afterEach(() => {
  if (savedEnv === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
  else process.env.PLATFORM_ADMIN_EMAILS = savedEnv
})

// ── Pure helpers ─────────────────────────────────────────────────────────────
test('platform-admin helpers: normalize, validate, allowlist, flag', () => {
  assert.equal(normalizeInviteEmail('  Casey@Example.COM '), 'casey@example.com')
  assert.ok(isValidInviteEmail('a@b.co'))
  assert.ok(!isValidInviteEmail('not-an-email'))
  assert.deepEqual(platformAdminEmails('a@x.com, B@x.com ,'), ['a@x.com', 'b@x.com'])
  assert.deepEqual(platformAdminEmails(undefined), [])
  assert.ok(isPlatformAdmin({ is_platform_admin: true }, null))
  assert.ok(!isPlatformAdmin({ is_platform_admin: false }, 'nobody@x.com', []))
  assert.ok(isPlatformAdmin({ is_platform_admin: false }, 'Temecng12@Gmail.Com', ['temecng12@gmail.com']))
  assert.ok(!isPlatformAdmin(null, null, []))
})

// ── Gate ─────────────────────────────────────────────────────────────────────
test('unauthenticated callers are refused', async () => {
  resetFake({ tables: tables(), user: null })
  assert.equal((await inviteCoach(undefined, inviteForm())).error, 'Not authenticated')
  assert.equal(state.tables.coach_invites.length, 0)
  assert.equal(emailFake.coachInvites.length, 0)
})

test('non-admin coaches cannot invite coaches', async () => {
  resetFake({ tables: tables(), user: COACH })
  state.tables.profiles.push({ id: COACH.id, role: 'coach', is_platform_admin: false })
  const r = await inviteCoach(undefined, inviteForm())
  assert.equal(r.error, 'Only platform admins can invite coaches.')
  assert.equal(state.tables.coach_invites.length, 0)
  assert.equal(emailFake.coachInvites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('env allowlist grants access when the DB is behind migration 041', async () => {
  process.env.PLATFORM_ADMIN_EMAILS = 'temecng12@gmail.com'
  fail({ table: 'profiles', action: 'select', error: { code: 'PGRST204', message: "Could not find the 'is_platform_admin' column of 'profiles' in the schema cache" } })
  const r = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.equal(r.error, undefined)
  assert.match(r.success ?? '', new RegExp(`Invite sent to ${CASEY}`))
  assert.equal(emailFake.coachInvites.length, 1)
})

test('a real DB failure on the admin check is an error, not access', async () => {
  fail({ table: 'profiles', action: 'select', error: { message: 'boom' } })
  const r = await inviteCoach(undefined, inviteForm())
  assert.match(r.error ?? '', /Could not check admin access/)
  assert.equal(emailFake.coachInvites.length, 0)
})

// ── Validation ───────────────────────────────────────────────────────────────
test('bad email and missing name are refused before anything is written', async () => {
  assert.match((await inviteCoach(undefined, inviteForm('nope', 'N'))).error ?? '', /valid email/)
  assert.match((await inviteCoach(undefined, inviteForm('ok@example.com', ''))).error ?? '', /name/i)
  assert.equal(state.tables.coach_invites.length, 0)
  assert.equal(emailFake.coachInvites.length, 0)
})

// ── Happy path ───────────────────────────────────────────────────────────────
test('admin invites a new coach: row saved, Supabase invite link, Resend email', async () => {
  const r = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.equal(r.error, undefined)
  assert.match(r.success ?? '', new RegExp(`Invite sent to ${CASEY}`))
  assert.doesNotMatch(r.success ?? '', /team|roster/i, 'their own org, nothing shared')
  assert.equal(state.tables.coach_invites.length, 1)
  const row = state.tables.coach_invites[0]
  assert.equal(row.email, CASEY)
  assert.equal(row.invited_by, ADMIN.id)
  assert.ok(typeof row.token === 'string' && row.token.length > 0)
  assert.deepEqual(authAdmin.links, [CASEY])
  assert.equal(emailFake.coachInvites.length, 1)
  assert.equal(emailFake.coachInvites[0].toEmail, CASEY)
  assert.match(emailFake.coachInvites[0].inviteUrl, /^https:\/\/auth\.test\/invite/)
})

// ── Existing accounts are never double-created ───────────────────────────────
test('an email that already has a coach account gets no email', async () => {
  authAdmin.users.push({ id: 'u-casey', email: CASEY })
  state.tables.profiles.push({ id: 'u-casey', role: 'coach' })
  const r = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.match(r.success ?? '', /already has a coach account/)
  assert.match(r.success ?? '', /\/auth\/login/)
  assert.equal(emailFake.coachInvites.length, 0)
  assert.equal(authAdmin.links.length, 0)
  assert.equal(state.tables.coach_invites.length, 0)
})

test('an email on a player account is refused, never re-roled', async () => {
  authAdmin.users.push({ id: 'u-kid', email: 'kid@example.com' })
  state.tables.profiles.push({ id: 'u-kid', role: 'player' })
  const r = await inviteCoach(undefined, inviteForm('kid@example.com', 'Kid Player'))
  assert.match(r.error ?? '', /player or parent account/)
  assert.equal(emailFake.coachInvites.length, 0)
  assert.equal(state.tables.coach_invites.length, 0)
  assert.equal((state.tables.profiles.find(p => p.id === 'u-kid') as { role: string }).role, 'player')
})

test('a Supabase invite for an email that just gained an account sends no email', async () => {
  authAdmin.existingEmails.add('fresh@example.com')
  const r = await inviteCoach(undefined, inviteForm('fresh@example.com', 'Fresh Face'))
  assert.match(r.success ?? '', /already has an account/)
  assert.doesNotMatch(r.success ?? '', /Invite sent/)
  assert.equal(emailFake.coachInvites.length, 0)
})

// ── Resend / pending states ──────────────────────────────────────────────────
test('a pending invite resends with a fresh token and stays one row', async () => {
  const first = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.ok(first.success)
  const token1 = state.tables.coach_invites[0].token
  const second = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.ok(second.success)
  assert.equal(state.tables.coach_invites.length, 1)
  assert.notEqual(state.tables.coach_invites[0].token, token1)
  assert.equal(emailFake.coachInvites.length, 2)
})

test('an accepted invite is never emailed again', async () => {
  state.tables.coach_invites.push({ id: 'i1', email: CASEY, invited_by: ADMIN.id, token: 't', created_at: '2026-10-01T00:00:00Z', accepted_at: '2026-10-02T00:00:00Z' })
  const r = await inviteCoach(undefined, inviteForm(CASEY, 'Casey Spencer'))
  assert.match(r.success ?? '', /already accepted/)
  assert.equal(emailFake.coachInvites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('failed invite link: error, email never promised', async () => {
  authAdmin.linkError = { code: 'unexpected_failure', message: 'boom' }
  const r = await inviteCoach(undefined, inviteForm('x@example.com', 'X'))
  assert.match(r.error ?? '', /sign-in link could not be created/)
  assert.doesNotMatch(r.error ?? '', /boom/, 'no raw provider text')
  assert.equal(r.success, undefined)
  assert.equal(emailFake.coachInvites.length, 0)
})

test('invite email not sent: error that says the invite was saved + resend', async () => {
  emailFake.coachInviteResult = { error: 'Email sending is not set up' }
  const r = await inviteCoach(undefined, inviteForm('x@example.com', 'X'))
  assert.match(r.error ?? '', /Invite saved for x@example\.com, but the email could not be sent/)
  assert.equal(r.success, undefined)
  assert.equal(state.tables.coach_invites.length, 1, 'retryable from the dashboard')

  resetFake({ tables: tables(), user: ADMIN }); emailFake.reset()
  emailFake.coachInviteResult = 'throw'
  const r2 = await inviteCoach(undefined, inviteForm('y@example.com', 'Y'))
  assert.match(r2.error ?? '', /could not be sent \(network down\)/)
  assert.equal(r2.success, undefined)
})

// ── Accept (auth/callback helper) ────────────────────────────────────────────
test('accept: no invite row means nothing happens', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  const before = JSON.stringify(state.tables)
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u1', email: 'nobody@example.com' }), 'none')
  assert.equal(JSON.stringify(state.tables), before)
})

test('accept: pending invite marks accepted, ensures coach profile, records Terms', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  state.tables.coach_invites.push({ id: 'i1', email: CASEY, invited_by: ADMIN.id, token: 't', created_at: '2026-10-05T00:00:00Z', accepted_at: null })
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u-casey', email: CASEY }), 'accepted')
  assert.ok((state.tables.coach_invites[0] as { accepted_at: string }).accepted_at)
  const profile = state.tables.profiles.find(p => p.id === 'u-casey') as { role: string }
  assert.equal(profile.role, 'coach')
  assert.equal(state.tables.terms_acceptances.length, 1)
})

test('accept: a Google-signed-in invitee with no footprint is upgraded to coach', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  state.tables.coach_invites.push({ id: 'i1', email: CASEY, invited_by: ADMIN.id, token: 't', created_at: '2026-10-05T00:00:00Z', accepted_at: null })
  state.tables.profiles.push({ id: 'u-casey', role: 'player', full_name: 'Casey Spencer' })
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u-casey', email: CASEY }), 'accepted')
  assert.equal((state.tables.profiles.find(p => p.id === 'u-casey') as { role: string }).role, 'coach')
})

test('accept: an established player account is never re-roled by an invite', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  state.tables.coach_invites.push({ id: 'i1', email: 'kid@example.com', invited_by: ADMIN.id, token: 't', created_at: '2026-10-05T00:00:00Z', accepted_at: null })
  state.tables.profiles.push({ id: 'u-kid', role: 'player' })
  state.tables.players.push({ id: 'p1', user_id: 'u-kid', full_name: 'Kid' })
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u-kid', email: 'kid@example.com' }), 'accepted')
  assert.equal((state.tables.profiles.find(p => p.id === 'u-kid') as { role: string }).role, 'player')
})

test('accept: already-accepted invite writes nothing new', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  state.tables.coach_invites.push({ id: 'i1', email: CASEY, invited_by: ADMIN.id, token: 't', created_at: '2026-10-01T00:00:00Z', accepted_at: '2026-10-02T00:00:00Z' })
  const ops = state.ops.length
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u-casey', email: CASEY }), 'already')
  assert.equal(state.ops.length, ops + 1, 'only the lookup runs')
})

test('accept: a database behind 041 is a no-op, sign-in never blocked', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  fail({ table: 'coach_invites', action: 'select', error: { code: '42P01', message: 'relation "public.coach_invites" does not exist' } })
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u1', email: 'x@example.com' }), 'none')
})

// ── Public signup stays closed ───────────────────────────────────────────────
test('public signup is still the invite-only holding page', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../app/auth/signup/page.tsx', import.meta.url), 'utf8')
  assert.match(src, /invite-only/)
  assert.match(src, /Join the waitlist/)
  assert.doesNotMatch(src, /Create Coach Account/)
})
