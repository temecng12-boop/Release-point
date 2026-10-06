/**
 * Login "Email Link": a rate limit (429) reads the same as a sent link, so it
 * can't reveal which emails have accounts; network and other errors are shown.
 * Also the login page's error boxes (role="alert") and the sign-in copy.
 * Run with: npx tsx --test src/lib/__tests__/email-link.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { requestEmailLink, EMAIL_LINK_SENT_MESSAGE, type EmailLinkAuth } from '../email-link'
import { NETWORK_ERROR } from '../password-reset'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

function fakeAuth(reply: Awaited<ReturnType<EmailLinkAuth['signInWithOtp']>> | 'throw') {
  const calls: Parameters<EmailLinkAuth['signInWithOtp']>[0][] = []
  const auth: EmailLinkAuth = {
    async signInWithOtp(args) {
      calls.push(args)
      if (reply === 'throw') throw new TypeError('Failed to fetch')
      return reply
    },
  }
  return { auth, calls }
}

const REDIRECT = 'https://releasepointai.com/auth/callback'

test('a sent link: neutral message, email and redirect passed through', async () => {
  const f = fakeAuth({ error: null })
  assert.deepEqual(await requestEmailLink(f.auth, 'p@example.com', REDIRECT), { ok: true, message: EMAIL_LINK_SENT_MESSAGE })
  assert.deepEqual(f.calls, [{ email: 'p@example.com', options: { emailRedirectTo: REDIRECT } }])
  assert.equal(EMAIL_LINK_SENT_MESSAGE, 'Check your email for a sign-in link.')
})

test('a rate limit (429) reads exactly like a sent link', async () => {
  const sent = await requestEmailLink(fakeAuth({ error: null }).auth, 'new@example.com', REDIRECT)
  for (const error of [
    { message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' },
    { message: 'For security purposes, you can only request this after 42 seconds.', status: 429, code: 'over_email_send_rate_limit' },
    { message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' },
    { message: 'Too Many Requests', status: 429 },
  ]) {
    assert.deepEqual(await requestEmailLink(fakeAuth({ error }).auth, 'p@example.com', REDIRECT), sent, error.message)
  }
})

test('other failures are shown, never as sent', async () => {
  const thrown = await requestEmailLink(fakeAuth('throw').auth, 'p@example.com', REDIRECT)
  assert.deepEqual(thrown, { ok: false, error: NETWORK_ERROR })
  const returned = await requestEmailLink(fakeAuth({ error: { message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' } }).auth, 'p@example.com', REDIRECT)
  assert.deepEqual(returned, thrown)
  assert.deepEqual(
    await requestEmailLink(fakeAuth({ error: { message: 'Unable to validate email address: invalid format', status: 400, code: 'validation_failed' } }).auth, 'p@', REDIRECT),
    { ok: false, error: 'Unable to validate email address: invalid format' })
  assert.deepEqual(
    await requestEmailLink(fakeAuth({ error: { message: 'Error sending magic link email', status: 500 } }).auth, 'p@example.com', REDIRECT),
    { ok: false, error: 'Error sending magic link email' })
})

test('login page: Email Link uses requestEmailLink and shows its result', () => {
  const login = read('app/auth/login/page.tsx')
  assert.match(login, /requestEmailLink\(createClient\(\)\.auth, magicEmail, `\$\{window\.location\.origin\}\/auth\/callback`\)/)
  assert.match(login, /setMagicState\(result\.ok \? \{ success: result\.message \} : \{ error: result\.error \}\)/)
  assert.doesNotMatch(login, /auth\.signInWithOtp/, 'the link request goes through requestEmailLink')
})

test('login page: every error box is announced (role="alert")', () => {
  const login = read('app/auth/login/page.tsx')
  // Each red error container (the rgba(200,3,30,...) box) carries role="alert".
  const boxes = [...login.matchAll(/<div\b[^>]*background: 'rgba\(200,3,30,0\.06\)'[^>]*>/g)].map(m => m[0])
  assert.equal(boxes.length, 4, 'url error, password error, forgot-password error, email-link error')
  for (const box of boxes) assert.match(box, /role="alert"/, box)
  for (const cond of ['urlError', 'state\\?\\.error', 'forgotState\\.error', 'magicState\\.error']) {
    assert.match(login, new RegExp(`\\{${cond} && \\(\\s*<div [^>]*role="alert"`), cond)
  }
})

test('login copy: players sign up without a password and use an email link', () => {
  const login = read('app/auth/login/page.tsx')
  assert.match(login, />Coaches: use your password or an email link\. Players sign up without a password, so use an email link\.</)
  assert.doesNotMatch(login, /Players: use an email link\./)
  // Player signup and invites never set a password: both send an email link.
  const auth = read('app/actions/auth.ts')
  const signUpPlayer = auth.slice(auth.indexOf('export async function signUpPlayer'), auth.indexOf('export async function signIn('))
  assert.match(signUpPlayer, /signInWithOtp\(/)
  assert.doesNotMatch(signUpPlayer, /password/)
  assert.match(read('app/actions/invite.ts'), /generateLink\(\{\s*type: 'invite'/)
  assert.doesNotMatch(login, /free for coaches|\$\d|pricing/i)
})
