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
  assert.match(confirm, /\/auth\/complete\?next=/, 'old fragment links finish in the bundled complete page')
  assert.match(confirm, /status: 303/, 'redirects keep the fragment (Location carries none of its own)')
  assert.match(confirm, /invite_expired/, 'expired links get an honest error, not a silent redirect')
  assert.doesNotMatch(root('app/auth/confirm/route.ts'), /page\.tsx/, 'no stale client page alongside the route')
})

test('the callback sends fragment-suspect requests to /auth/complete with a 303', () => {
  const src = root('app/auth/callback/route.ts')
  assert.match(src, /\/auth\/complete\?next=/, 'old fragment links can still sign in')
  assert.match(src, /status: 303/, 'the fragment survives the redirect')
  assert.equal(src.includes(['esm', '.sh'].join('')), false, 'no CDN on the sign-in path')
})

test('failed token links land on login with honest errors, never a silent dashboard redirect', () => {
  const login = root('app/auth/login/page.tsx')
  assert.match(login, /urlError === 'invite_expired'/, 'expired links explained')
  assert.match(login, /Ask your coach for a new invite/, 'tells the invitee what to do next')
  assert.match(login, /urlError === 'invite_failed'/, 'other failures explained')
  const confirm = root('app/auth/confirm/route.ts')
  assert.doesNotMatch(confirm, /\/dashboard'\}\)/, 'no silent dashboard redirect on failure')
})

test('/auth/complete restores the old confirm page on bundled code, plus gates', () => {
  const src = root('app/auth/complete/page.tsx')
  assert.match(src, /'use client'/, 'client page')
  assert.match(src, /createClient\(\)/, 'the bundled browser client')
  assert.match(src, /from '@\/lib\/supabase\/client'/, 'not a CDN import')
  assert.equal(src.includes(['esm', '.sh'].join('')), false, 'no CDN anywhere')
  // Restored behaviors of the removed confirm page.
  assert.match(src, /next === RESET_PATH && \(searchParams\.get\('error'\) \|\| hashParams\.get\('error'\)\)/, 'reset-link errors go back to the reset page')
  assert.match(src, /\$\{RESET_PATH\}\?error=link/, 'reset page explains it')
  assert.match(src, /await supabase\.auth\.signOut\(\{ scope: 'local' \}\)/, 'local sign-out before setSession (QA-012)')
  assert.match(src, /supabase\.auth\.setSession\(\{ access_token: accessToken, refresh_token: refreshToken \}\)/, 'fragment sign-in')
  assert.match(src, /history\.replaceState\(null, (""|'')/, 'the hash is stripped')
  assert.match(src, /runAction\(\(\) => linkPlayerRow\(\)\)/, 'linkPlayerRow with retry')
  assert.match(src, /role="alert"/, 'honest error states')
  assert.match(src, /Continue Anyway/, 'the continue escape hatch')
  assert.match(src, /safeRedirectPath\(/, 'every redirect target is sanitized')
  assert.match(src, /\/auth\/callback\?code=/, 'query codes still forward to the callback')
  assert.match(src, /Suspense/, 'useSearchParams stays suspended')
  // Additions: the same gates as the routes, through the server action.
  assert.match(src, /acceptInviteAndRoute/, 'invite-only reject + age routing server-side')
  assert.match(src, /link-failed/, 'an unstuck link gets the honest retry state')
  assert.doesNotMatch(src, /window\.location\.href = safeRedirectPath\(next,/, 'never navigates on without the gate result')
})
