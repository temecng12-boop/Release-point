/**
 * QA-013: public static/metadata routes skip the auth redirect; pages don't.
 * Checks both isPublicAssetPath and the real middleware matcher, compiled the
 * way Next compiles it.
 * Run with: npx tsx --test src/lib/__tests__/public-paths.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as staticInfo from 'next/dist/build/analysis/get-page-static-info.js'
import { isPublicAssetPath } from '../public-paths'

const PUBLIC = [
  '/manifest.webmanifest', '/icon', '/icon1', '/icon-abc123', '/icon/small', '/apple-icon', '/apple-icon-x1',
  '/sw.js', '/robots.txt', '/sitemap.xml', '/favicon.ico',
  '/opengraph-image', '/twitter-image', '/about/opengraph-image', '/about/opengraph-image-1a2b', '/twitter-image2',
  '/logo.png', '/rp-icon.png', '/rp-mark-small-color.svg', '/rp-mark-color.svg', '/media/nolan-release.jpg', '/file.svg', '/annotation-test.html', '/fonts/x.woff2',
  '/_next/static/chunks/main.js', '/_next/image',
]
const PROTECTED = [
  '/dashboard', '/dashboard/team/1', '/clips/abc', '/clips/compare', '/profile/1', '/onboarding', '/guardian',
  '/player-settings', '/api/ai-chat', '/icons', '/iconography', '/profile/icon', '/manifest',
  '/sw.jsx', '/robots', '/dashboard/opengraph-imagex', '/clips/sw.js.bak',
]

function matcherRegexps(): RegExp[] {
  const src = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8')
  const lit = src.slice(src.indexOf('matcher:')).match(/'(\/\(\(\?!.*?)',/)
  assert.ok(lit, 'matcher literal found')
  const matcher = lit![1].replace(/\\\\/g, '\\')
  const get = (staticInfo as { getMiddlewareMatchers?: unknown }).getMiddlewareMatchers
    ?? (staticInfo as { default?: { getMiddlewareMatchers?: unknown } }).default?.getMiddlewareMatchers
  const out = (get as (m: string[], c: object) => { regexp: string }[])([matcher], {})
  return out.map(m => new RegExp(m.regexp))
}
const runsMiddleware = (p: string) => matcherRegexps().some(r => r.test(p))

test('isPublicAssetPath: public assets yes, app pages and APIs no', () => {
  for (const p of PUBLIC) assert.equal(isPublicAssetPath(p), true, p)
  for (const p of PROTECTED) assert.equal(isPublicAssetPath(p), false, p)
})

test('middleware matcher (as Next compiles it) skips public assets and still runs on protected pages', () => {
  for (const p of PUBLIC) assert.equal(runsMiddleware(p), false, `matcher should skip ${p}`)
  for (const p of PROTECTED) assert.equal(runsMiddleware(p), true, `matcher should run on ${p}`)
  for (const p of ['/', '/auth/login', '/about']) assert.equal(runsMiddleware(p), true, p)
})
