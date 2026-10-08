/**
 * Waitlist / public CTA copy matches Design COPY-FOR-BUILD.md.
 * Run with: npx tsx --test src/lib/__tests__/waitlist-copy.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

test('waitlist page: Design strings', () => {
  const page = read('app/waitlist/page.tsx')
  const form = read('app/waitlist/waitlist-form.tsx')
  assert.match(page, /title: 'Join the Waitlist'/)
  assert.doesNotMatch(page, /Join the waitlist · Release Point \| Release Point/)
  assert.match(page, /In internal testing/)
  assert.match(page, /Join the Waitlist/)
  assert.match(form, /Join the waitlist/)
  assert.match(page, /pitching and hitting video frame by frame/)
  assert.match(page, /Frame-by-frame video markup for pitching and hitting/)
  assert.match(page, /Get early access/)
  assert.match(page, /testing with a small group right now/)
  assert.match(form, /Release Point AI is for players 13 and older/)
  assert.match(form, /Players under 18 should sign up with a parent or guardian/)
  assert.match(form, /You're on the list|You&apos;re on the list/)
  assert.match(form, /submitting\.current/)
  assert.match(form, /disabled=\{state === 'loading'/)
  assert.doesNotMatch(page, /Get Started|Free for coaches|import pitch/i)
})

test('home / about / footer / login / signup holding: waitlist CTAs, no public signup push', () => {
  const home = read('app/page.tsx')
  const about = read('app/about/page.tsx')
  const footer = read('components/SiteFooter.tsx')
  const login = read('app/auth/login/page.tsx')
  const signup = read('app/auth/signup/page.tsx')
  for (const [name, src] of [['home', home], ['about', about], ['footer', footer]] as const) {
    assert.match(src, /Join the waitlist/, name)
    assert.doesNotMatch(src, /Get Started|Coach Sign Up|Player Login|Start Free|Free for coaches/, name)
    assert.doesNotMatch(src, /href=["']\/auth\/signup["']/, name)
  }
  assert.match(login, /New here\? Join the waitlist/)
  assert.match(signup, /Release Point is in internal testing/)
  assert.match(signup, /invite-only for now/)
  assert.match(signup, /href=["']\/waitlist["']/)
})

test('age-stop points to a parent or guardian, never a coach', () => {
  const notice = read('components/age-stop-notice.tsx')
  const file = read('lib/stop-message.ts')
  const m = file.match(/AGE_STOP_MESSAGE =\s*"([^"]+)"/)
  assert.ok(m, 'stop message literal found')
  const msg = m[1]
  assert.match(msg, /We need a parent's or guardian's permission first\./)
  assert.match(msg, /privacy@releasepointai\.com/)
  assert.doesNotMatch(msg, /coach/i)
  assert.doesNotMatch(msg, /\b13\b/)
  assert.match(notice, /text-lg sm:text-xl/)
  assert.match(notice, /border-amber-400 bg-amber-50/)
  assert.match(notice, /data-testid="age-stop"/)
  assert.match(read('app/onboarding/age/page.tsx'), /<AgeStopNotice \/>/)
  assert.match(read('app/auth/signup/signup-form.tsx'), /AgeStopNotice/)
  assert.match(read('components/age-confirm-form.tsx'), /<AgeStopNotice \/>/)
})
