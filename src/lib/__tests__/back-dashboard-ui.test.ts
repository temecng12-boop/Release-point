/**
 * Back-to-dashboard control on the coach clip viewer.
 *
 * The linked Dashboard breadcrumb is `hidden sm:inline`, so coaches get lost
 * on iPhones. The clip viewer (`app/clips/[id]/page.tsx`) now passes
 * backHref/backLabel to AppHeader, which renders an outline button right
 * after the Logo (inside the sticky header, so it stays visible while
 * scrolling). The repo has no DOM test setup, so this reads the sources.
 * Run with: npx tsx --test src/lib/__tests__/back-dashboard-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const header = read('components/app-header.tsx')
const page = read('app/clips/[id]/page.tsx')
const banner = read('app/clips/[id]/save-banner.tsx')

/** The opening tag of the back control (<Link ...>), attributes included. */
function backLinkTag(): string {
  const start = header.indexOf('{backHref && (')
  assert.ok(start >= 0, 'back control gated on backHref not found')
  const link = header.indexOf('<Link', start)
  const end = header.indexOf('>', header.indexOf('style=', link))
  return header.slice(link, end + 1)
}

/** Full block of the back control (link open tag through </Link>). */
function backLinkBlock(): string {
  const start = header.indexOf('{backHref && (')
  const end = header.indexOf('</Link>', start)
  return header.slice(start, end)
}

test('AppHeader takes optional backHref/backLabel props', () => {
  assert.match(header, /backHref\?: string/)
  assert.match(header, /backLabel\?: string/)
  assert.match(header, /\{ breadcrumbs, right, showSignOut, backHref, backLabel, mobileNav \}/)
})

test('the control is a real link to the backHref prop with nav-back transition', () => {
  const tag = backLinkTag()
  assert.match(tag, /href=\{backHref\}/)
  assert.match(tag, /transitionTypes=\{\['nav-back'\]\}/)
  assert.doesNotMatch(backLinkBlock(), /history\.back|router\.push|router\.back/)
})

test('accessible name comes from the backLabel prop (defaults to Back to dashboard)', () => {
  const tag = backLinkTag()
  assert.match(tag, /aria-label=\{backLabel \?\? 'Back to dashboard'\}/)
})

test('chevron-left icon plus responsive labels (full on desktop, Dashboard under 640px)', () => {
  const block = backLinkBlock()
  assert.match(block, /<svg[^>]*width="16"[^>]*height="16"/)
  assert.match(block, /strokeWidth="2"/)
  assert.match(block, /d="M15 19l-7-7 7-7"/)
  // The header's unlayered display rule beats sm:hidden, so the swap uses
  // sr-only like the Report button instead of display utilities.
  assert.match(block, /sr-only sm:not-sr-only/)
  assert.match(block, /\{backLabel \?\? 'Back to dashboard'\}/)
  assert.match(block, /not-sr-only sm:sr-only/)
  assert.match(block, />Dashboard</)
})

test('44px tap target with px-4 and no max-sm gating', () => {
  const block = backLinkBlock()
  assert.match(block, /min-h-11/)
  assert.match(block, /px-4/)
  assert.doesNotMatch(block, /max-sm:/)
})

test('outline-button styling on existing navy tokens (never red)', () => {
  const block = backLinkBlock()
  assert.match(block, /rounded-lg/)
  assert.match(block, /bg-white/)
  assert.match(block, /border-\[#DDE4ED\]/)
  assert.match(block, /var\(--rp-navy/)
  assert.match(block, /text-xs/)
  assert.match(block, /style=\{\{ \.\.\.oswald, color: 'var\(--rp-navy/)
  assert.match(header, /textTransform: 'uppercase'/) // the shared oswald style
  assert.match(block, /letterSpacing/)
  assert.match(block, /hover:border-\[color:var\(--rp-navy/)
  assert.match(block, /hover:bg-\[var\(--rp-navy-50\)\]/)
  assert.match(block, /focus-visible:ring-2/)
  assert.match(block, /focus-visible:ring-\[var\(--rp-navy\)\]/)
  assert.doesNotMatch(block, /#C8102E|#C8031E|red-700|accent/)
})

test('the control sits right after the Logo in the sticky header, safe-area aware', () => {
  const logo = header.indexOf('<Logo')
  const back = header.indexOf('{backHref && (')
  const crumbs = header.indexOf('breadcrumbs?.map')
  assert.ok(logo >= 0 && back > logo && crumbs > back, 'order: Logo, back control, breadcrumbs')
  assert.match(header, /sticky top-0/)
  assert.match(header, /env\(safe-area-inset-top/)
})

test('the header never wraps at 375px next to Report / Sign Out', () => {
  const block = backLinkBlock()
  assert.match(block, /shrink-0/)
  assert.match(block, /whitespace-nowrap/)
  // The wordmark is already mark-only below 480px; the current-page crumb
  // hides on phones whenever a back button is shown.
  assert.match(header, /wordmarkClass="hidden min-\[480px\]:inline/)
  assert.match(header, /crumb\.href \|\| backHref \? 'hidden sm:inline-flex' : 'flex'/)
})

test('clip page passes backHref/backLabel and drops the linked Dashboard crumb', () => {
  assert.match(page, /backHref="\/dashboard"/)
  assert.match(page, /backLabel="Back to dashboard"/)
  assert.match(page, /breadcrumbs=\{\[\{ label: clip\.title \}\]\}/)
  const appHeaderUse = page.slice(page.indexOf('<AppHeader'), page.indexOf('/>', page.indexOf('<AppHeader')) + 3)
  assert.doesNotMatch(appHeaderUse, /href: '\/dashboard'/)
})

test('the clip switcher row is untouched (prev / compare / next)', () => {
  assert.match(page, /href=\{`\/clips\/\$\{prevClipRow\.id\}`\}/)
  assert.match(page, /href=\{`\/clips\/compare\?a=\$\{id\}`\}/)
  assert.match(page, /href=\{`\/clips\/\$\{nextClipRow\.id\}`\}/)
  assert.match(page, /Compare/)
})

test('the save-banner Done control is untouched', () => {
  assert.match(banner, /Done\. Back to Dashboard/)
  assert.match(banner, /router\.push\('\/dashboard'\)/)
  assert.match(banner, /bg-\[#C8102E\]/)
})
