/**
 * Password reset: fixed same-origin redirectTo, the neutral "sent" message,
 * visible errors, the recovery-session check, and the page wiring.
 * Run with: npx tsx --test src/lib/__tests__/password-reset.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  passwordResetRedirectUrl, requestPasswordReset, hasRecoverySession,
  RESET_SENT_MESSAGE, RESET_PATH, type ResetRequestAuth,
} from '../password-reset'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

test('redirectTo is fixed and same-origin with the site URL', () => {
  assert.equal(passwordResetRedirectUrl('https://releasepointai.com'), 'https://releasepointai.com/auth/confirm?next=%2Fauth%2Freset')
  // Only the origin of the site URL is used (trailing slash, path, query ignored).
  assert.equal(passwordResetRedirectUrl('https://releasepointai.com/'), 'https://releasepointai.com/auth/confirm?next=%2Fauth%2Freset')
  assert.equal(passwordResetRedirectUrl('https://releasepointai.com/x?next=//evil.example'), 'https://releasepointai.com/auth/confirm?next=%2Fauth%2Freset')
  assert.equal(passwordResetRedirectUrl(undefined), 'http://localhost:3000/auth/confirm?next=%2Fauth%2Freset')
  for (const site of ['https://releasepointai.com', 'http://localhost:3000', 'https://preview-abc.vercel.app']) {
    const u = new URL(passwordResetRedirectUrl(site))
    assert.equal(u.origin, new URL(site).origin)
    assert.equal(u.pathname, '/auth/confirm')
    assert.deepEqual([...u.searchParams], [['next', RESET_PATH]])
  }
})

function fakeAuth(reply: Awaited<ReturnType<ResetRequestAuth['resetPasswordForEmail']>> | 'throw') {
  const calls: { email: string; redirectTo: string }[] = []
  const auth: ResetRequestAuth = {
    async resetPasswordForEmail(email, { redirectTo }) {
      calls.push({ email, redirectTo })
      if (reply === 'throw') throw new TypeError('Failed to fetch')
      return reply
    },
  }
  return { auth, calls }
}

test('the same neutral message whether or not the email has an account', async () => {
  // Supabase answers the same for known and unknown emails; so does the form.
  const known = fakeAuth({ error: null })
  const unknown = fakeAuth({ error: null })
  const a = await requestPasswordReset(known.auth, ' coach@example.com ')
  const b = await requestPasswordReset(unknown.auth, 'nobody@example.com')
  assert.deepEqual(a, { ok: true, message: RESET_SENT_MESSAGE })
  assert.deepEqual(b, a)
  assert.equal(RESET_SENT_MESSAGE, 'If an account exists for that email, a reset link is on its way.')
  assert.equal(known.calls[0].email, 'coach@example.com')
})

test('the email address never changes redirectTo (no user input in it)', async () => {
  const f = fakeAuth({ error: null })
  await requestPasswordReset(f.auth, 'a+next=//evil.example@example.com')
  assert.equal(f.calls[0].redirectTo, passwordResetRedirectUrl())
  assert.doesNotMatch(f.calls[0].redirectTo, /evil/)
})

test('errors are shown: rate limit, network failure, other Supabase errors, bad email', async () => {
  const rl = await requestPasswordReset(fakeAuth({ error: { message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' } }).auth, 'c@example.com')
  assert.deepEqual(rl, { ok: false, error: 'Too many reset requests. Wait a few minutes, then try again.' })
  const net = await requestPasswordReset(fakeAuth('throw').auth, 'c@example.com')
  assert.equal(net.ok, false)
  assert.match((net as { error: string }).error, /Couldn't reach the server/)
  const returned = await requestPasswordReset(fakeAuth({ error: { message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' } }).auth, 'c@example.com')
  assert.deepEqual(returned, net, 'a fetch failure returned by supabase-js reads the same as a thrown one')
  const other = await requestPasswordReset(fakeAuth({ error: { message: 'Error sending recovery email', status: 500 } }).auth, 'c@example.com')
  assert.deepEqual(other, { ok: false, error: 'Couldn\'t send the reset email: Error sending recovery email' })
  const f = fakeAuth({ error: null })
  assert.equal((await requestPasswordReset(f.auth, 'not-an-email')).ok, false)
  assert.equal(f.calls.length, 0)
})

test('hasRecoverySession: only a verified session whose amr includes recovery', async () => {
  const claims = (c: unknown, error: unknown = null) => ({ getClaims: async () => ({ data: c as never, error }) })
  assert.equal(await hasRecoverySession(claims({ claims: { amr: [{ method: 'recovery', timestamp: 1 }] } })), true)
  assert.equal(await hasRecoverySession(claims({ claims: { amr: ['recovery'] } })), true)
  assert.equal(await hasRecoverySession(claims({ claims: { amr: [{ method: 'password' }] } })), false, 'a normal sign-in is not a reset session')
  assert.equal(await hasRecoverySession(claims({ claims: {} })), false)
  assert.equal(await hasRecoverySession(claims(null)), false, 'no session')
  assert.equal(await hasRecoverySession(claims(null, { message: 'JWT expired' })), false, 'expired')
  assert.equal(await hasRecoverySession({ getClaims: async () => { throw new Error('network') } }), false)
})

test('reset links reach /auth/reset on main: middleware lets a signed-in recovery session through', () => {
  const mw = read('middleware.ts')
  assert.match(mw, /pathname !== '\/auth\/reset'/)
  const cb = read('app/auth/callback/route.ts')
  assert.match(cb, /next === RESET_PATH \? `\$\{origin\}\$\{RESET_PATH\}\?error=link`/)
  assert.match(cb, /length > 0 && next !== RESET_PATH/)
  const confirm = read('app/auth/confirm/page.tsx')
  assert.match(confirm, /next === RESET_PATH && \(searchParams\.get\('error'\) \|\| hashParams\.get\('error'\)\)/)
})

test('reset page and login form: 44px targets and accessible errors', () => {
  const form = read('app/auth/reset/reset-form.tsx')
  assert.match(form, /aria-describedby="new-password-rule"/)
  assert.match(form, /aria-describedby="confirm-password-msg"/)
  assert.equal((form.match(/role="alert"/g) ?? []).length, 2)
  assert.match(form, /type="submit"[\s\S]*?!min-h-11/)
  assert.match(form, /href="\/auth\/login\?reset=1"[^>]*!min-h-11/)
  assert.doesNotMatch(form, /auth\.updateUser/, 'the password is changed by the server action, not the browser')
  const login = read('app/auth/login/page.tsx')
  assert.match(login, /Forgot password\?/)
  assert.match(login, /inline-flex items-center !min-h-11 px-1[^"]*"\s*>\s*Forgot password\?/)
  assert.match(login, /id="forgot-error" role="alert"/)
  assert.match(login, /requestPasswordReset\(createClient\(\)\.auth, forgotEmail\)/)
})

test('copy: login says passwords are for coaches; signup error box is an alert; privacy mentions resets', () => {
  const login = read('app/auth/login/page.tsx')
  assert.doesNotMatch(login, /Works for coaches and players/)
  assert.match(login, /For coaches\. Use the email and password you signed up with\./)
  assert.match(read('app/auth/signup/page.tsx'), /role="alert" className="rounded-lg px-4 py-3"/)
  assert.match(read('app/privacy/page.tsx'), /password resets/)
})
