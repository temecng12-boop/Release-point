/**
 * /auth/confirm (server route) and the /auth/callback fragment fallback,
 * through the real route modules with faked Supabase/Next servers:
 * - an invited player token verifies server-side (cookies set, no fragment),
 *   links the invite, and lands on /onboarding (the age-screen funnel);
 * - a brand-new stranger is deleted, signed out, and sent to the waitlist;
 * - an existing user without an invite is untouched;
 * - expired/invalid tokens redirect to login with an honest error code;
 * - no-params requests get the fragment-fallback page (old implicit emails).
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

test('no token_hash: fragment-fallback page (old implicit emails), never a silent redirect', async () => {
  const r = (await confirm(req('/auth/confirm'))) as Response
  const html = await r.text()
  assert.match(html, /createBrowserClient/, 'cookie-based browser client (plain setSession only writes localStorage)')
  assert.match(html, /setSession\(\{ access_token, refresh_token \}\)/, 'reads the hash and establishes the session')
  assert.match(html, /replaceState/, 'strips the tokens from the URL')
  assert.match(html, /\/auth\/callback\?next=/, 'routes through the callback gates afterwards')
  assert.doesNotMatch(html, /H&type=invite/, 'no tokens embedded')
})

test('callback with no session and no params: same fragment fallback (old emails to /auth/callback)', async () => {
  const r = (await callback(req('/auth/callback'))) as Response
  const html = await r.text()
  assert.match(html, /createBrowserClient/)
  assert.match(html, /\/auth\/callback\?next=/)
})
