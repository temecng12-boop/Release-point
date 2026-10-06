/**
 * Promo v8 brand chrome: tokens, logo SVG, mark-only <480px, navy tabs.
 * Run with: npx tsx --test src/lib/__tests__/brand-chrome.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const css = readFileSync(join(root, 'src', 'app', 'globals.css'), 'utf8')
const logo = readFileSync(join(root, 'src', 'components', 'Logo.tsx'), 'utf8')
const header = readFileSync(join(root, 'src', 'components', 'app-header.tsx'), 'utf8')
const footer = readFileSync(join(root, 'src', 'components', 'SiteFooter.tsx'), 'utf8')
const tabs = readFileSync(join(root, 'src', 'app', 'clips', '[id]', 'clip-tabs.tsx'), 'utf8')
const player = readFileSync(join(root, 'src', 'components', 'video-player.tsx'), 'utf8')

test('brand tokens expose promo red and navy', () => {
  assert.match(css, /--accent:\s*#C8031E/)
  assert.match(css, /--accent-dim:\s*#A30219/)
  assert.match(css, /--rp-navy:\s*#023167/)
  assert.match(css, /\.rp-cta\s*\{/)
  assert.match(css, /\.rp-tab-active\s*\{/)
  assert.match(css, /\.rp-callout-navy\s*\{/)
})

test('SVG wordmark assets ship with seams-readable mark', () => {
  const small = join(root, 'public', 'rp-mark-small-color.svg')
  const full = join(root, 'public', 'rp-mark-color.svg')
  assert.ok(existsSync(small), 'rp-mark-small-color.svg')
  assert.ok(existsSync(full), 'rp-mark-color.svg')
  const svg = readFileSync(small, 'utf8')
  assert.match(svg, /<svg/i)
  assert.ok(svg.length > 200)
})

test('Logo uses seamed full mark and mark-only below 480px', () => {
  assert.match(logo, /rp-mark-color\.svg/)
  assert.doesNotMatch(logo, /rp-mark-small-color\.svg/)
  assert.match(logo, /Release Point AI/)
  assert.match(logo, /hidden min-\[480px\]:inline/)
  assert.match(logo, /--rp-navy/)
  assert.match(header, /wordmarkClass="hidden min-\[480px\]:inline/)
})

test('footer lockup uses seamed mark and Release Point AI wordmark', () => {
  assert.match(footer, /rp-icon\.png/)
  assert.doesNotMatch(footer, /rp-mark-small-color\.svg/)
  assert.match(footer, /Release Point AI/)
})

test('clip tabs active state is navy', () => {
  assert.match(tabs, /--rp-navy/)
  assert.match(tabs, /rp-tab-active/)
  assert.match(tabs, /rp-tab-indicator/)
  assert.doesNotMatch(tabs, /#E8102A/)
})

test('video player stamp/recording callouts use navy chrome and brand CTA', () => {
  assert.match(player, /rp-callout-navy/)
  assert.match(player, /Timestamped notes/)
  assert.match(player, /Stop & save/)
  assert.match(player, /rp-cta/)
})
