/**
 * /auth/confirm (server route) and the /auth/callback fragment fallback,
 * through the real route modules with faked Supabase/Next servers:
 * - an invited player token verifies server-side (cookies set, no fragment),
 *   links the invite, and lands on /onboarding (the age-screen funnel);
 * - a brand-new stranger is deleted, signed out, and sent to the waitlist;
 * - an existing user without an invite is untouched;
 * - expired/invalid tokens redirect to login with an honest error code;
 * - no-params requests 303 to /auth/complete (old implicit emails keep
 *   their fragment across the redirect and finish in bundled code).
 * Run with: npx tsx --tsconfig src/lib/__tests__/routes/tsconfig.json --test src/lib/__tests__/routes/*.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from '../actions/fakes/db'
import { authAdmin } from '../actions/fakes/supabase-admin'
import { ssrAuth } from './fakes/ssr'
import { NextRequest } from './fakes/next-server'
import { GET as confirm } from '../../../app/auth/confirm/route'
import { GET as callback } from '../../../app/auth/callback/route'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'

const ORIGIN = 'https://releasepointai.com'
const req = (path: string) => new NextRequest(`${ORIGIN}${path}`) as never
const NOW = new Date().toISOString()
const OLD = new Date(Date.now() - 90 * 86_400_000).toISOString()

beforeEach(() => {
  resetFake({ tables: { players: [], profiles: [], coach_invites: [] } })
  authAdmin.reset()
  ssrAuth.reset()
})

test('invited player token: verified server-side, invite linked, onward to /onboarding', async () => {
  state.tables.players.push({ id: 'p1', email: 'kid@example.com', user_id: null, coach_id: 'coach-1', full_name: 'Kid' })
  ssrAuth.verifyUser = { id: 'u-kid', email: 'kid@example.com', created_at: NOW }
  const r = (await confirm(req('/auth/confirm?token_hash=H&type=invite&next=/dashboard'))) as unknown as { status: number; location: string }
  assert.equal(r.status, 307)
  assert.equal(r.location, `${ORIGIN}/onboarding`, 'newly linked players start at onboarding (age-screen funnel)')
  assert.deepEqual(ssrAuth.verifyCalls, [{ token_hash: 'H', type: 'invite' }], 'verifyOtp ran with the hashed token')
  assert.ok(ssrAuth.cookieWrites > 0, 'the session was set server-side via cookies')
  assert.equal(state.tables.players[0].user_id, 'u-kid', 'the invite row is linked')
  assert.deepEqual(authAdmin.deletedUsers, [], 'nobody is deleted')
})

test('brand-new stranger: deleted, signed out, sent to /waitlist?reason=invite_only', async () => {
  state.tables.profiles.push({ id: 'u-x', role: 'player', full_name: 'X' })
  ssrAuth.verifyUser = { id: 'u-x', email: 'stranger@example.com', created_at: NOW }
  const r = (await confirm(req('/auth/confirm?token_hash=H&type=invite'))) as unknown as { status: number; location: string }
  assert.equal(r.location, `${ORIGIN}/waitlist?reason=invite_only`)
  assert.deepEqual(authAdmin.deletedUsers, ['u-x'], 'the stray auth user is deleted')
  assert.ok(state.ops.some((o) => o.table === 'profiles' && o.action === 'delete'), 'the stray profile is deleted')
  assert.equal(ssrAuth.signOuts.length, 1, 'the session is signed out')
})

test('existing user without an invite is untouched and continues to next', async () => {
  ssrAuth.verifyUser = { id: 'u-old', email: 'cadenduke@tracylc.net', created_at: OLD }
  const r = (await confirm(req('/auth/confirm?token_hash=H&type=magiclink&next=/dashboard'))) as unknown as { status: number; location: string }
  assert.equal(r.location, `${ORIGIN}/dashboard`)
  assert.deepEqual(authAdmin.deletedUsers, [])
  assert.equal(ssrAuth.signOuts.length, 0)
})

test('expired token: honest invite_expired error on login; other failures get invite_failed', async () => {
  ssrAuth.verifyError = { message: 'Token has expired or is invalid', code: 'otp_expired' }
  const expired = (await confirm(req('/auth/confirm?token_hash=H&type=invite'))) as unknown as { status: number; location: string }
  assert.equal(expired.location, `${ORIGIN}/auth/login?error=invite_expired`)

  ssrAuth.verifyError = { message: 'Database error', code: 'unexpected_failure' }
  const failed = (await confirm(req('/auth/confirm?token_hash=H&type=invite'))) as unknown as { status: number; location: string }
  assert.equal(failed.location, `${ORIGIN}/auth/login?error=invite_failed`, 'never a silent dashboard redirect')
})

test('recovery failure goes back to the reset page, which explains it', async () => {
  ssrAuth.verifyError = { message: 'Token has expired or is invalid', code: 'otp_expired' }
  const r = (await confirm(req('/auth/confirm?token_hash=H&type=recovery&next=/auth/reset'))) as unknown as { status: number; location: string }
  assert.equal(r.location, `${ORIGIN}/auth/reset?error=link`)
})

test('no token_hash: 303 to /auth/complete so the browser keeps the fragment (old implicit emails)', async () => {
  const r = (await confirm(req('/auth/confirm'))) as unknown as { status: number; location: string }
  assert.equal(r.status, 303)
  assert.equal(r.location, `${ORIGIN}/auth/complete?next=%2Fdashboard`)
  assert.doesNotMatch(r.location, /#/, 'the Location carries no fragment of its own, so browsers keep the hash')
})

test('a ?code= link is preserved to /auth/callback (server-readable, no fragment needed)', async () => {
  const r = (await confirm(req('/auth/confirm?code=C&next=/auth/reset'))) as unknown as { status: number; location: string }
  assert.equal(r.status, 303)
  assert.match(r.location, /\/auth\/callback\?code=C&next=%2Fauth%2Freset/)
})

test('callback with no session and no params: 303 to /auth/complete (old emails to /auth/callback)', async () => {
  const r = (await callback(req('/auth/callback'))) as unknown as { status: number; location: string }
  assert.equal(r.status, 303)
  assert.equal(r.location, `${ORIGIN}/auth/complete?next=%2Fdashboard`)
  assert.doesNotMatch(r.location, /#/)
})

test('reset ?error= is forwarded to /auth/complete so the 303 does not drop it', async () => {
  const r = (await confirm(req('/auth/confirm?next=/auth/reset&error=access_denied'))) as unknown as { status: number; location: string }
  assert.equal(r.status, 303)
  assert.equal(r.location, `${ORIGIN}/auth/complete?next=%2Fauth%2Freset&error=link`)
  const cb = (await callback(req('/auth/callback?next=/auth/reset&error=otp_expired'))) as unknown as { status: number; location: string }
  assert.equal(cb.status, 303)
  assert.equal(cb.location, `${ORIGIN}/auth/complete?next=%2Fauth%2Freset&error=link`)
})

test('confirm and callback forward sanitized error_code and error_description with error=link', async () => {
  const desc = 'Signup is invite-only. Ask your coach for an invite, or join the waitlist.'
  const path = `/auth/confirm?error=access_denied&error_code=unexpected_failure&error_description=${encodeURIComponent(desc)}`
  const r = (await confirm(req(path))) as unknown as { status: number; location: string }
  assert.equal(r.status, 303)
  const loc = new URL(r.location)
  assert.equal(loc.pathname, '/auth/complete')
  assert.equal(loc.searchParams.get('next'), '/dashboard')
  assert.equal(loc.searchParams.get('error'), 'link')
  assert.equal(loc.searchParams.get('error_code'), 'unexpected_failure')
  assert.equal(loc.searchParams.get('error_description'), desc)

  const cb = (await callback(req(`/auth/callback?error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent(desc)}`))) as unknown as { status: number; location: string }
  assert.equal(cb.status, 303)
  const cbLoc = new URL(cb.location)
  assert.equal(cbLoc.pathname, '/auth/complete')
  assert.equal(cbLoc.searchParams.get('error'), 'link')
  assert.equal(cbLoc.searchParams.get('error_code'), 'otp_expired')
  assert.equal(cbLoc.searchParams.get('error_description'), desc)
})

test('join_team is refused when the inviter is not organizer of that team (no client-trusted team_id)', async () => {
  const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  state.tables.coach_invites = [
    { id: 'inv-1', email: 'asst@example.com', invited_by: 'org-a', accepted_at: null },
  ]
  state.tables.team_coaches = [
    { team_id: TEAM_A, coach_id: 'org-a', role: 'organizer' },
    { team_id: TEAM_B, coach_id: 'org-b', role: 'organizer' },
  ]
  state.tables.profiles.push({ id: 'u-asst', role: 'coach', full_name: 'Asst' })
  ssrAuth.verifyUser = { id: 'u-asst', email: 'asst@example.com', created_at: NOW }
  const before = state.tables.team_coaches.length
  const r = (await confirm(req(`/auth/confirm?token_hash=H&type=invite&join_team=${TEAM_B}`))) as unknown as { location: string }
  assert.ok(r.location.startsWith(ORIGIN))
  assert.equal(state.tables.team_coaches.length, before, 'must not join a team the inviter does not organize')
  assert.ok(!state.tables.team_coaches.some((row) => row.team_id === TEAM_B && row.coach_id === 'u-asst'))
})

test('join_team succeeds only when a pending coach_invites row exists and the inviter organizes that team', async () => {
  const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  state.tables.coach_invites = [
    { id: 'inv-1', email: 'asst@example.com', invited_by: 'org-a', accepted_at: null },
  ]
  state.tables.team_coaches = [
    { team_id: TEAM_A, coach_id: 'org-a', role: 'organizer' },
  ]
  state.tables.profiles.push({ id: 'u-asst', role: 'coach', full_name: 'Asst' })
  ssrAuth.verifyUser = { id: 'u-asst', email: 'asst@example.com', created_at: NOW }
  await confirm(req(`/auth/confirm?token_hash=H&type=invite&join_team=${TEAM_A}`))
  assert.ok(
    state.tables.team_coaches.some((row) => row.team_id === TEAM_A && row.coach_id === 'u-asst' && row.role === 'assistant'),
    'assistant is added only for the invited team',
  )
})

test('forwarded error_code and error_description are charset-limited and length-capped', async () => {
  const long = 'x'.repeat(500)
  const r = (await confirm(req(`/auth/confirm?error=x&error_code=${encodeURIComponent('otp_expired<script>')}&error_description=${encodeURIComponent(`\n${long}`)}`))) as unknown as { status: number; location: string }
  const loc = new URL(r.location)
  assert.equal(loc.searchParams.get('error'), 'link')
  assert.doesNotMatch(loc.searchParams.get('error_code') ?? '', /<|>|\x00/)
  assert.ok((loc.searchParams.get('error_code') ?? '').length <= 64)
  assert.doesNotMatch(loc.searchParams.get('error_description') ?? '', /\n/)
  assert.ok((loc.searchParams.get('error_description') ?? '').length <= 200)
})
