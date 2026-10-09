/**
 * The one screen (birth month and year, name, email, Terms) in the UI:
 * - the age cutoff never shows on the form: rendered text, attributes, and the
 *   browser code the form ships with (compliance item 3);
 * - the dashboard / onboarding gates send unanswered players to it once;
 * - the coach banners, one-tap band buttons and invite band are gone, and the
 *   Edit Player band picker is optional;
 * - 44px tap targets on the form's controls.
 * Run with: npx tsx --test src/lib/__tests__/age-ui.test.tsx
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import AgeConfirmForm from '../../components/age-confirm-form'
import AgeStopNotice from '../../components/age-stop-notice'
import AccountLoadError from '../../components/account-load-error'

const SRC = new URL('../../', import.meta.url)
const src = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

// ── 1. The cutoff never shows ───────────────────────────────────────────────
const CUTOFF = /under[\s-]*13|\b13\b|thirteen/i
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const render = (el: ReactElement) => renderToStaticMarkup(h(AppRouterContext.Provider, { value: router as never }, el))
const noop = async () => undefined

/** What a person can see or hear: text nodes and every attribute value except
 *  styling and SVG geometry (class, style, d, viewBox, points). */
function userVisible(html: string): string[] {
  const out: string[] = []
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '\n')
  for (const t of text.split('\n')) if (t.trim()) out.push(t.trim().replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&'))
  for (const m of html.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) {
    if (!['class', 'style', 'd', 'viewBox', 'points'].includes(m[1])) out.push(`${m[1]}=${m[2]}`)
  }
  return out
}
const assertNoCutoff = (html: string, what: string) => {
  const hits = userVisible(html).filter((s) => CUTOFF.test(s))
  assert.deepEqual(hits, [], `${what}: the cutoff shows in ${JSON.stringify(hits)}`)
}

test('cutoff scan: the scanner itself catches "under 13", "13" and "thirteen" (control)', () => {
  for (const bad of ['<p>You must be 13 or older</p>', '<p>Under 13? Ask a parent</p>', '<input placeholder="thirteen+">', '<p aria-label="min 13"></p>', '<p>Players under-13 need consent</p>']) {
    assert.ok(userVisible(bad).some((s) => CUTOFF.test(s)), bad)
  }
  assert.equal(userVisible('<svg><path d="M13 8l7.89 5.26"/></svg><p>2013</p>').some((s) => CUTOFF.test(s)), false, 'SVG geometry and a year are not copy')
})

test('cutoff scan: the rendered one screen (signup, account, stop message) never names the cutoff', () => {
  const signup = render(h(AgeConfirmForm, { mode: 'signup', action: noop, onBack: () => {} }))
  const account = render(h(AgeConfirmForm, { mode: 'account', action: noop, email: 'kid@example.com', defaultName: 'Sam Lee', next: '/onboarding' }))
  const stopped = render(h(AgeConfirmForm, { mode: 'signup', action: noop, stopped: true, onBack: () => {} }))
  const oauth = render(h(AgeConfirmForm, { mode: 'oauth', action: noop, onBack: () => {} }))
  const stop = render(h(AgeStopNotice))
  // Positive control: these really are the forms.
  for (const name of ['birth_month', 'birth_year', 'full_name', 'tos']) {
    assert.match(signup, new RegExp(`name="${name}"`), `signup has ${name}`)
    assert.match(account, new RegExp(`name="${name}"`), `account has ${name}`)
  }
  assert.match(signup, /name="email"/)
  assert.doesNotMatch(account, /name="email"/, 'account mode shows the signed-in email read-only')
  assert.match(account, /kid@example\.com/)
  assert.match(stopped, /data-testid="age-stop"/)
  assert.doesNotMatch(stopped, /name="birth_year"/, 'stop message only, no form')
  assert.match(stop, /We need a parent(&#x27;|')s or guardian(&#x27;|')s permission first\./)
  assert.match(oauth, /name="birth_year"/)
  for (const [what, html] of [['signup', signup], ['account', account], ['oauth', oauth], ['stopped', stopped], ['stop notice', stop]] as const) assertNoCutoff(html, what)
  // The year field has no min/max and the month list no hint.
  assert.doesNotMatch(signup, /\s(min|max)="/)
})

test('cutoff scan: every error the one screen can show is free of the cutoff', async () => {
  const { BIRTH_INVALID } = await import('../age-band')
  const { TOS_REQUIRED, NAME_REQUIRED } = await import('../signup-fields')
  const { SELF_CONFIRM_FAILED, ALREADY_ANSWERED } = await import('../consent-server')
  for (const e of [BIRTH_INVALID, TOS_REQUIRED, NAME_REQUIRED, SELF_CONFIRM_FAILED, ALREADY_ANSWERED, 'Enter your email address.', "We couldn't send your sign-in link. Check the email address and try again.", 'Your session has expired. Sign in again.']) {
    assert.doesNotMatch(e, CUTOFF, e)
  }
})

// The browser code the signup and first-sign-in screens ship: follow the
// imports from the client entry points. A 'use server' file is only a
// reference in the browser bundle, so the walk stops there.
function resolveImport(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = new URL(spec.slice(2), SRC).pathname
  else if (spec.startsWith('.')) base = new URL(spec, `file://${from}`).pathname
  else return null
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}
function clientGraph(entries: string[]): { files: string[]; serverRefs: string[] } {
  const seen = new Set<string>(); const serverRefs = new Set<string>()
  const stack = entries.map((e) => new URL(e, SRC).pathname)
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    const text = readFileSync(f, 'utf8')
    if (/^\s*['"]use server['"]/.test(text)) { serverRefs.add(f); continue }
    seen.add(f)
    for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resolveImport(f, m[1] ?? m[2])
      if (r) stack.push(r)
    }
  }
  const rel = (p: string) => p.slice(SRC.pathname.length)
  return { files: [...seen].map(rel).sort(), serverRefs: [...serverRefs].map(rel).sort() }
}
const CLIENT_ENTRIES = ['app/auth/signup/signup-form.tsx', 'components/age-confirm-form.tsx']

test('cutoff scan: the one screen\'s browser code has no age rules and no copy naming the cutoff', () => {
  const { files, serverRefs } = clientGraph(CLIENT_ENTRIES)
  assert.ok(files.includes('lib/common-passwords.ts'), 'the coach form\'s password list is scanned too (no exceptions)')
  assert.ok(files.includes('components/age-confirm-form.tsx') && files.includes('components/birth-fields.tsx'), files.join(', '))
  for (const banned of ['lib/age-band.ts', 'lib/under13-mode.ts', 'lib/consent.ts', 'lib/consent-server.ts', 'lib/terms-acceptance.ts']) {
    assert.ok(!files.includes(banned), `${banned} must not be in the browser code (found via ${CLIENT_ENTRIES.join(', ')})`)
  }
  assert.deepEqual(serverRefs, ['app/actions/auth.ts'], 'only the signup action, as a server reference')
  for (const f of files) {
    const code = src(f)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '') // comments are stripped from the bundle
      .replace(/\sd="[^"]*"/g, '').replace(/viewBox="[^"]*"/g, '') // SVG geometry
    // Copy lives in string literals and JSX text (a number like a font size isn't copy).
    const strings = [...code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0])
    const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean)
    const hits = [...strings, ...jsxText].filter((l) => CUTOFF.test(l))
    assert.deepEqual(hits, [], `${f}: ${JSON.stringify(hits)}`)
    assert.ok(strings.length > 0, `${f}: literals found`)
  }
})

test('cutoff scan: the account-mode page and the stop page carry no cutoff copy', () => {
  for (const f of ['app/onboarding/age/page.tsx', 'app/under-13/page.tsx', 'app/auth/signup/page.tsx']) {
    const visible = src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/import[^\n]*\n/g, '')
    assert.doesNotMatch(visible.replace(/AGE_STOP_COOKIE|under13|Under13|under-13/g, ''), CUTOFF, f)
  }
})

// ── 2. One screen, once ─────────────────────────────────────────────────────
test('signup page: invite-only holding page; the stop cookie is read on onboarding, not here', () => {
  const page = src('app/auth/signup/page.tsx')
  assert.doesNotMatch(page, /cookies\(\)|AGE_STOP_COOKIE|SignupForm/)
  assert.match(page, /invite-only/)
  assert.match(page, /Join the waitlist/)
  assert.match(page, /href=["']\/waitlist["']/)
  assert.match(page, /Release Point AI is in internal testing/)
  // Invite / confirm flows still use the form; once stopped, only the stop message.
  const form = src('app/auth/signup/signup-form.tsx')
  assert.match(form, /\{stopped \? \(\s*<AgeStopNotice \/>/, 'once stopped, only the stop message (no player, coach or Google/Apple path)')
  assert.match(form, /<AgeConfirmForm mode="signup" action=\{signUpPlayer\} onBack=\{onBack\} onStopped=\{onStopped\} \/>/)
  assert.match(form, /if \(state\?\.stopped\) return <AgeStopNotice \/>/, 'the coach form shows the same stop message')
  assert.doesNotMatch(form, /checkSignupAge|BirthFields|guardian_email|adult_confirmed/)
  const age = src('app/onboarding/age/page.tsx')
  assert.match(age, /cookies\(\)\)\.get\(AGE_STOP_COOKIE\)/)
  assert.match(age, /<AgeStopNotice \/>/)
})

test('signup page: the Google/Apple buttons only appear after the birth month/year and Terms pass the server check', () => {
  const form = src('app/auth/signup/signup-form.tsx')
  assert.match(form, /<AgeConfirmForm mode="oauth" action=\{startOAuthSignup\} onBack=\{onBack\} onStopped=\{onStopped\} readyContent=\{<ProviderButtons \/>\} \/>/)
  // signInWithOAuth is only reachable from ProviderButtons, and ProviderButtons only from readyContent.
  const uses = [...form.matchAll(/<ProviderButtons\b/g)].length
  assert.equal(uses, 1, 'ProviderButtons is rendered only as the ready content')
  const pb = form.slice(form.indexOf('function ProviderButtons'), form.indexOf('\nfunction ', form.indexOf('function ProviderButtons') + 10))
  assert.match(pb, /signInWithOAuth/)
  assert.equal(form.split('signInWithOAuth').length - 1, (pb.split('signInWithOAuth').length - 1), 'no other OAuth start')
  const html = render(h(AgeConfirmForm, { mode: 'oauth', action: noop, onBack: () => {}, readyContent: h('p', null, 'BUTTONS') }))
  assert.match(html, /name="birth_month"/)
  assert.match(html, /name="tos"/)
  assert.doesNotMatch(html, /name="full_name"|name="email"|BUTTONS/, 'oauth mode: no name or email (the provider gives those), no buttons until ready')
})

test('dashboard and onboarding: unanswered players go to the one screen before the position picker; frozen sees the stop message', () => {
  const d = src('app/dashboard/page.tsx')
  assert.match(d, /dashboardRoute\(profileRead, isCoach \? null : \{ data: playerRow, error: playerReadError \}\) === 'age'\) redirect\('\/onboarding\/age'\)/)
  assert.match(d, /dashboardRoute\(profileRead, null\) === 'error'\) \{[\s\S]{0,120}<AccountLoadError retryHref="\/dashboard" \/>/, 'a failed profile read shows the error, no redirect')
  assert.match(d, /frozen && <AgeStopNotice \/>/)
  assert.match(d, /redirect\('\/onboarding\/age'\)/)
  assert.doesNotMatch(d, /redirect\('\/onboarding'\)/, 'empty position is valid; the dashboard does not force the picker')
  assert.match(src('app/onboarding/page.tsx'), /needsAgeConfirm\(playerRow\)\) redirect\('\/onboarding\/age'\)/)
  const a = src('app/onboarding/age/page.tsx')
  assert.match(a, /<AgeConfirmForm mode="account" action=\{confirmAgeAndTerms\}/)
  assert.ok(a.indexOf('AGE_STOP_COOKIE') < a.indexOf('agePageRoute(stopCookie'), 'the cookie decides first')
  assert.match(a, /route === 'dashboard'\) redirect\('\/dashboard'\)/, 'answered: never shown again')
  assert.match(a, /<AccountLoadError retryHref="\/onboarding\/age" \/>/, 'a failed read shows the error, never a bounce back to the dashboard')
})

// ── 3. Removed ───────────────────────────────────────────────────────────────
function allSource(dir = new URL('./', SRC).pathname): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}${e.name}`
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') out.push(...allSource(`${p}/`)) }
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

test('removed: coach banners, one-tap band buttons, age screen form, debug-clip route; nothing references them', () => {
  for (const f of ['app/dashboard/age-band-confirm.tsx', 'app/dashboard/mark-adult-button.tsx', 'app/dashboard/age-band-fields.tsx', 'app/dashboard/age-screen-form.tsx', 'app/dashboard/pending-players-banner.tsx', 'lib/pending-players.ts', 'app/api/debug-clip/route.ts', 'components/under13-stop.tsx']) {
    assert.equal(existsSync(new URL(f, SRC)), false, `${f} is deleted`)
  }
  // needsAgeScreen is live again (#57's middleware age-screen gate).
  const dead = /age-band-confirm|AgeBandConfirm|mark-adult-button|MarkAdult|age-band-fields|AgeBandFields|age-screen-form|AgeScreenForm|pending-players|PendingPlayers|pendingBannerLines|debug-clip|canSelfConfirm|needsFirstAgeScreen|needsCoachAction|selfConfirm|setPlayerAdultConfirmed|submitAgeAnswer|checkSignupAge|Under13Stop/
  for (const f of allSource()) assert.doesNotMatch(readFileSync(f, 'utf8'), dead, f)
})

test('invite forms: birth month/year required (no band, no guardian); Edit Player: the band picker is optional', () => {
  assert.match(src('app/dashboard/team/[id]/team-invite-form.tsx'), /AddPlayerModal/)
  for (const f of ['app/dashboard/invite-form.tsx', 'app/dashboard/add-player-modal.tsx']) {
    const s = src(f)
    assert.doesNotMatch(s, /age_band|AgeBand/, `${f}: no band picker`)
    assert.match(s, /name="birth_month"[^>]*required/, `${f}: birth month is required`)
    assert.match(s, /name="birth_year"[^>]*required/, `${f}: birth year is required`)
  }
  const edit = src('app/dashboard/edit-player-modal.tsx')
  assert.match(edit, /Player Age <span[^>]*>\(optional\)<\/span>/)
  assert.doesNotMatch(edit.slice(edit.indexOf('Player Age')), /^[^\n]*type="radio"[^\n]*required/m, 'no required band')
  assert.match(edit, /if \(band && band !== initialBand\)/, 'saved only when the coach picks one')
})

// ── 4. Tap targets ───────────────────────────────────────────────────────────
test('the one screen\'s controls are at least 44px tall', () => {
  for (const mode of ['signup', 'oauth'] as const) {
    const html = render(h(AgeConfirmForm, { mode, action: noop, onBack: () => {} }))
    for (const m of html.matchAll(/<(input|select|button)\b[^>]*>/g)) {
      if (/type="checkbox"/.test(m[0])) continue
      assert.match(m[0], /min-h-11/, `${mode}: ${m[0]}`)
    }
    assert.match(html, /<label class="[^"]*min-h-11[^"]*"><input type="checkbox"/, `${mode}: the Terms checkbox row is 44px`)
  }
})

test('account load error: friendly copy, Try Again and Sign Out are 44px, no raw error, no cutoff', () => {
  const html = render(h(AccountLoadError, { retryHref: '/onboarding/age' }))
  assert.match(html, /data-testid="account-load-error"/)
  assert.match(html, /<a[^>]*href="\/onboarding\/age"[^>]*min-h-11|<a[^>]*min-h-11[^>]*href="\/onboarding\/age"/)
  assert.match(html, /<form[^>]*action="\/auth\/signout"[^>]*method="post"|<form[^>]*method="post"[^>]*action="\/auth\/signout"/i)
  assert.match(html, /<button[^>]*min-h-11[^>]*>Sign Out<\/button>/)
  assert.doesNotMatch(html, /error:|PGRST|relation|column|permission denied/i)
  assertNoCutoff(html, 'account load error')
})

test('privacy page: under-13 cannot sign up; teens need guardian permission (no self-register slogan)', () => {
  const p = src('app/privacy/page.tsx')
  const children = src('lib/privacy-children.ts')
  assert.match(p, /CHILDREN_AND_TEENS_BODY/)
  assert.match(children, /Children under 13 cannot sign up/)
  assert.match(children, /Players 13 to 17 need a parent's or guardian's permission to use Release Point AI/)
  assert.match(children, /Coaches cannot add players under 13/)
  assert.doesNotMatch(p + children, /Players can create their own accounts, or their coach can invite them/)
  assert.doesNotMatch(p + children, /self-register/i)
  assert.doesNotMatch(p + children, /do not self-register/i)
})
