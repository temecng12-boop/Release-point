/**
 * Invite emails use server-side accept links: /auth/confirm?token_hash=…&
 * type=invite&next=…, built from generateLink's hashed_token -- never the raw
 * action_link, whose implicit-flow fragment tokens a server route can't see.
 * Run with: npx tsx --test src/lib/__tests__/invite-accept-link.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildInviteAcceptUrl } from '../invite-accept-link'

const root = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const script = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')

test('the emailed link is /auth/confirm with token_hash, type=invite, and next', () => {
  const url = buildInviteAcceptUrl('https://releasepointai.com/', 'HASHED', '/onboarding')
  assert.equal(url, 'https://releasepointai.com/auth/confirm?token_hash=HASHED&type=invite&next=%2Fonboarding')
  const coach = buildInviteAcceptUrl(undefined, 'HASHED', '/dashboard')
  assert.equal(coach, 'https://releasepointai.com/auth/confirm?token_hash=HASHED&type=invite&next=%2Fdashboard')
  assert.doesNotMatch(url, /#/, 'no fragment: the server sees every param')
})

test('player invite: built from hashed_token, never the raw action_link', () => {
  const src = root('app/actions/invite.ts')
  assert.match(src, /properties\?\.hashed_token/, 'uses the hashed token')
  assert.match(src, /buildInviteAcceptUrl\(siteUrl, linkData\.properties\.hashed_token, '\/onboarding'\)/, 'players land on onboarding (funnels to the age screen)')
  assert.doesNotMatch(src, /properties\?\.action_link/, 'never the fragment link')
})

test('coach invite action: built from hashed_token, never the raw action_link', () => {
  const src = root('app/actions/coach-invites.ts')
  assert.match(src, /properties\?\.hashed_token/, 'uses the hashed token')
  assert.match(src, /buildInviteAcceptUrl\(siteUrl, linkData\.properties\.hashed_token, '\/dashboard'\)/, 'coaches land on the dashboard')
  assert.doesNotMatch(src, /properties\?\.action_link/, 'never the fragment link')
})

test('ops script: built from hashed_token, never the raw action_link', () => {
  const src = script('scripts/invite-coach.mjs')
  assert.match(src, /properties\?\.hashed_token/, 'uses the hashed token')
  assert.match(src, /\/auth\/confirm\?token_hash=/, 'points at /auth/confirm')
  assert.doesNotMatch(src, /properties\?\.action_link/, 'never the fragment link')
})

test('both auth routes verify server-side and share the invite-only gate', () => {
  for (const f of ['app/auth/callback/route.ts', 'app/auth/confirm/route.ts']) {
    const src = root(f)
    assert.match(src, /isBrandNewUser\(user\)/, `${f}: only brand-new accounts are checked`)
    assert.match(src, /findInviteForEmail\(supabaseAdmin, user\.email\)/, `${f}: the invite lookup runs`)
    assert.match(src, /rejectStrayUser\(supabaseAdmin/, `${f}: strays are deleted, signed out`)
    assert.match(src, /\/waitlist\?reason=invite_only/, `${f}: rejected users land on the waitlist`)
    assert.match(src, /finishInviteAcceptance\(supabaseAdmin, user\)/, `${f}: shared acceptance work`)
  }
  const confirm = root('app/auth/confirm/route.ts')
  assert.match(confirm, /supabase\.auth\.verifyOtp\(\{ token_hash, type \}\)/, 'the session is set server-side')
  assert.match(confirm, /fragmentFallbackHtml\(next,/, 'old fragment links get the client fallback')
  assert.match(confirm, /invite_expired/, 'expired links get an honest error, not a silent redirect')
  assert.doesNotMatch(root('app/auth/confirm/route.ts'), /page\.tsx/, 'no stale client page alongside the route')
})

test('the callback serves the fragment fallback when no session and no params', () => {
  const src = root('app/auth/callback/route.ts')
  assert.match(src, /fragmentFallbackHtml\(next,/, 'old fragment links can still sign in')
})

test('failed token links land on login with honest errors, never a silent dashboard redirect', () => {
  const login = root('app/auth/login/page.tsx')
  assert.match(login, /urlError === 'invite_expired'/, 'expired links explained')
  assert.match(login, /Ask your coach for a new invite/, 'tells the invitee what to do next')
  assert.match(login, /urlError === 'invite_failed'/, 'other failures explained')
  const confirm = root('app/auth/confirm/route.ts')
  assert.doesNotMatch(confirm, /\/dashboard'\}\)/, 'no silent dashboard redirect on failure')
})
