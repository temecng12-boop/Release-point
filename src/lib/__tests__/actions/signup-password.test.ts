/**
 * signUp checks the password rule on the server, so a request that skips the
 * browser check (a direct POST) is still refused before Supabase is called.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/signup-password.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resetFake, fail, state } from './fakes/db'
import { signUpCalls, signUpFake } from './fakes/supabase-server'
import { signUp } from '../../../app/actions/auth'

const form = (password: string) => {
  const fd = new FormData()
  fd.set('tos', 'on'); fd.set('email', 'coach@example.com'); fd.set('full_name', 'Coach C'); fd.set('password', password)
  return fd
}

beforeEach(() => {
  // Coach signup is invite-only: the happy path needs a pending invite row.
  resetFake({ tables: { profiles: [], coach_invites: [{ id: 'i1', email: 'coach@example.com', accepted_at: null }] } })
  signUpCalls.length = 0
  signUpFake.reset()
})

test('server rejects a 7-character password without calling Supabase', async () => {
  const r = await signUp(undefined, form('Tq9#vLm'))
  assert.match(r?.error ?? '', /at least 8 characters/)
  assert.equal(signUpCalls.length, 0)
})

test('server rejects a common password in any case without calling Supabase', async () => {
  for (const pw of ['password', 'PassWord', 'BASEBALL']) {
    const r = await signUp(undefined, form(pw))
    assert.match(r?.error ?? '', /too common/, pw)
  }
  assert.equal(signUpCalls.length, 0)
})

test('server rejects a missing password field', async () => {
  const fd = form('x'); fd.delete('password')
  assert.match((await signUp(undefined, fd))?.error ?? '', /at least 8/)
  assert.equal(signUpCalls.length, 0)
})

test('an 8-character uncommon password reaches Supabase signUp', async () => {
  const r = await signUp(undefined, form('Tq9#vLm2'))
  assert.deepEqual(r, { message: 'check_email', email: 'coach@example.com' })
  assert.deepEqual(signUpCalls, [{ email: 'coach@example.com', password: 'Tq9#vLm2' }])
})

test('a failed coach profile upsert is reported, not redirected to the dashboard as a success', async () => {
  fail({ table: 'profiles', action: 'upsert', error: { code: '42501', message: 'new row violates row-level security policy for table "profiles"' } })
  const errors: unknown[] = []
  const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a) }
  let r: { error?: string } | undefined
  try { r = await signUp(undefined, form('Tq9#vLm2')) } finally { console.error = orig }
  assert.match(r?.error ?? '', /couldn't finish setting it up as a coach account/)
  assert.doesNotMatch(r?.error ?? '', /row-level|42501|profiles/, 'no raw DB text')
  assert.equal(errors.length, 1, 'raw error logged on the server')
  assert.deepEqual(state.tables.profiles, [])
})

test('a saved coach profile with no session returns check_email (no fake dashboard success)', async () => {
  const r = await signUp(undefined, form('Tq9#vLm2'))
  assert.deepEqual(r, { message: 'check_email', email: 'coach@example.com' })
  assert.deepEqual(state.tables.profiles.map(p => p.role), ['coach'])
})

test('when a session is present, invited coach signUp still redirects to the dashboard', async () => {
  signUpFake.session = { access_token: 'tok' }
  await assert.rejects(signUp(undefined, form('Tq9#vLm2')), (e: Error) => e.message === 'NEXT_REDIRECT')
  assert.deepEqual(state.tables.profiles.map(p => p.role), ['coach'])
})

test('coach signup form shows check-email honestly, never a fake success', () => {
  const page = readFileSync(new URL('../../../app/auth/signup/signup-form.tsx', import.meta.url), 'utf8')
  assert.match(page, /if \(state\?\.message === 'check_email'\)/)
  assert.match(page, /Check Your Email/)
  assert.match(page, /We sent a confirmation link to/)
  assert.match(page, /Click it to activate your account/)
  assert.doesNotMatch(page, /Account created|Welcome to the dashboard|You're in/i)
})

test('an invited player email through coach signUp stays player and gets an error (no fake success)', async () => {
  resetFake({
    tables: {
      profiles: [],
      // A player invite only -- no pending coach invite for this email.
      players: [{ id: 'p1', email: 'kid@example.com', user_id: null, coach_id: 'coach-1' }],
      coach_invites: [],
    },
  })
  const fd = form('Tq9#vLm2'); fd.set('email', 'kid@example.com')
  const r = await signUp(undefined, fd)
  assert.match(r?.error ?? '', /invite-only/, 'a clear error, not a success')
  assert.doesNotMatch(r?.error ?? '', /dashboard|welcome|check your email/i, 'no fake success')
  assert.equal(signUpCalls.length, 0, 'no account is created at all')
  assert.deepEqual(state.tables.profiles, [], 'no coach role is ever written')
})

test('a stranger email through coach signUp is refused before Supabase is called', async () => {
  resetFake({ tables: { profiles: [], coach_invites: [] } })
  const fd = form('Tq9#vLm2'); fd.set('email', 'stranger@example.com')
  const r = await signUp(undefined, fd)
  assert.match(r?.error ?? '', /invite-only/)
  assert.equal(signUpCalls.length, 0)
})
