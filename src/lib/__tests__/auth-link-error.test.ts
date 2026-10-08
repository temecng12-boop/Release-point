/**
 * completeErrorRedirect + forwardedAuthErrorQuery: every Supabase link/auth
 * error becomes an honest destination — never a silent login drop.
 * Run with: npx tsx --test src/lib/__tests__/auth-link-error.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RESET_PATH } from '../password-reset'
import {
  AUTH_ERROR_CODE_MAX,
  AUTH_ERROR_DESCRIPTION_MAX,
  completeErrorRedirect,
  forwardedAuthErrorQuery,
  readAuthLinkError,
  sanitizeAuthErrorParam,
} from '../auth-link-error'

const err = (partial: { error?: string | null; errorCode?: string | null; errorDescription?: string | null }) => ({
  error: partial.error ?? null,
  errorCode: partial.errorCode ?? null,
  errorDescription: partial.errorDescription ?? null,
})

test('no error: continue sign-in (null)', () => {
  assert.equal(completeErrorRedirect('/dashboard', err({})), null)
})

test('reset path: any error goes back to the reset page, which explains it', () => {
  assert.equal(completeErrorRedirect(RESET_PATH, err({ error: 'access_denied' })), `${RESET_PATH}?error=link`)
  assert.equal(
    completeErrorRedirect(RESET_PATH, err({ errorCode: 'otp_expired', errorDescription: 'Signup is invite-only.' })),
    `${RESET_PATH}?error=link`,
    'reset wins over invite-only and expired',
  )
})

test('invite-only in error_description (case-insensitive) goes to the waitlist', () => {
  assert.equal(
    completeErrorRedirect('/dashboard', err({
      error: 'access_denied',
      errorDescription: 'Signup is invite-only. Ask your coach for an invite, or join the waitlist.',
    })),
    '/waitlist?reason=invite_only',
  )
  assert.equal(
    completeErrorRedirect('/dashboard', err({ errorDescription: 'SIGNUP IS INVITE-ONLY right now' })),
    '/waitlist?reason=invite_only',
  )
})

test('otp_expired or "expired" goes to login?error=invite_expired', () => {
  assert.equal(
    completeErrorRedirect('/dashboard', err({ error: 'access_denied', errorCode: 'otp_expired' })),
    '/auth/login?error=invite_expired',
  )
  assert.equal(
    completeErrorRedirect('/onboarding', err({ errorDescription: 'Token has expired or is invalid' })),
    '/auth/login?error=invite_expired',
  )
  assert.equal(
    completeErrorRedirect('/dashboard', err({ error: 'expired' })),
    '/auth/login?error=invite_expired',
  )
})

test('any other error (access_denied, used link, unknown) goes to login?error=invite_failed', () => {
  assert.equal(
    completeErrorRedirect('/dashboard', err({ error: 'access_denied' })),
    '/auth/login?error=invite_failed',
  )
  assert.equal(
    completeErrorRedirect('/dashboard', err({ error: 'server_error', errorCode: 'unexpected_failure' })),
    '/auth/login?error=invite_failed',
  )
  assert.equal(
    completeErrorRedirect('/dashboard', err({ error: 'link' })),
    '/auth/login?error=invite_failed',
  )
})

test('invite-only wins over expired when both appear', () => {
  assert.equal(
    completeErrorRedirect('/dashboard', err({
      errorCode: 'otp_expired',
      errorDescription: 'Signup is invite-only.',
    })),
    '/waitlist?reason=invite_only',
  )
})

test('readAuthLinkError prefers query, falls back to hash', () => {
  const q = new URLSearchParams('error=access_denied&error_code=from_query')
  const h = new URLSearchParams('error=other&error_code=from_hash&error_description=Signup+is+invite-only.')
  assert.deepEqual(readAuthLinkError(q, h), {
    error: 'access_denied',
    errorCode: 'from_query',
    errorDescription: 'Signup is invite-only.',
  })
})

test('sanitize: control chars stripped, codes charset-limited, both length-capped', () => {
  assert.equal(sanitizeAuthErrorParam('otp_expired\x00<script>', AUTH_ERROR_CODE_MAX, 'code'), 'otp_expiredscript')
  assert.equal(sanitizeAuthErrorParam('x'.repeat(500), AUTH_ERROR_CODE_MAX, 'code').length, AUTH_ERROR_CODE_MAX)
  assert.equal(
    sanitizeAuthErrorParam('Signup is invite-only.\nAsk your coach.', AUTH_ERROR_DESCRIPTION_MAX, 'description'),
    'Signup is invite-only.Ask your coach.',
  )
  assert.equal(sanitizeAuthErrorParam('y'.repeat(500), AUTH_ERROR_DESCRIPTION_MAX, 'description').length, AUTH_ERROR_DESCRIPTION_MAX)
})

test('forwardedAuthErrorQuery: empty when nothing to forward; otherwise error=link plus capped fields', () => {
  assert.equal(forwardedAuthErrorQuery(new URLSearchParams()), '')
  const q = new URLSearchParams({
    error: 'access_denied',
    error_code: 'otp_expired<>',
    error_description: 'Signup is invite-only. Ask your coach.',
  })
  const suffix = forwardedAuthErrorQuery(q)
  const parsed = new URLSearchParams(suffix.replace(/^&/, ''))
  assert.equal(parsed.get('error'), 'link')
  assert.equal(parsed.get('error_code'), 'otp_expired')
  assert.equal(parsed.get('error_description'), 'Signup is invite-only. Ask your coach.')
})

test('login and waitlist still show honest copy for the destinations', () => {
  const login = readFileSync(new URL('../../app/auth/login/page.tsx', import.meta.url), 'utf8')
  assert.match(login, /urlError === 'invite_expired'/, 'expired links explained')
  assert.match(login, /Ask your coach for a new invite/, 'tells the invitee what to do next')
  assert.match(login, /urlError === 'invite_failed'/, 'other failures explained')
  const waitlist = readFileSync(new URL('../../app/waitlist/page.tsx', import.meta.url), 'utf8')
  assert.match(waitlist, /reason === 'invite_only'/)
  assert.match(waitlist, /role="status"/)
  assert.match(waitlist, /invite-only/i)
})
