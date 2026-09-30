/**
 * Tests for the service worker's routing decisions (QA-001). Loads
 * public/sw.js in a sandbox (no browser, no network).
 * Run with: npx tsx src/lib/__tests__/sw-routing.test.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

type Req = { method?: string; url: string; mode?: string; headers?: Record<string, string> }
type Res = { ok: boolean; status: number; type?: string; redirected?: boolean; cacheControl?: string | null }
type SwModule = {
  routeRequest: (req: Req, origin: string) => 'network' | 'cache-first'
  shouldStoreResponse: (res: Res) => boolean
  STATIC_CACHE: string
}

const code = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')
const sandbox = { module: { exports: {} as unknown }, URL }
runInNewContext(code, sandbox)
const sw = sandbox.module.exports as SwModule

let passed = 0
let failed = 0
function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) { console.log(`  ✓  ${label}`); passed++ }
  else { console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`); failed++ }
}

const O = 'https://releasepointai.com'
const route = (req: Req) => sw.routeRequest(req, O)
const net = (req: Req, label: string) => assert(route(req) === 'network', label, route(req))
const cache = (req: Req, label: string) => assert(route(req) === 'cache-first', label, route(req))

console.log('\n── cache name ──────────────────────────────────────────────────')
assert(sw.STATIC_CACHE !== 'rp-v1' && /v2/.test(sw.STATIC_CACHE), 'cache renamed from rp-v1 (versioned)', sw.STATIC_CACHE)

console.log('\n── pages, RSC, actions, api, auth: network only ────────────────')
net({ url: `${O}/clips/abc`, mode: 'navigate', headers: { accept: 'text/html' } }, 'navigation to a clip page')
net({ url: `${O}/dashboard`, mode: 'navigate' }, 'navigation to /dashboard')
net({ url: `${O}/`, headers: { accept: 'text/html,application/xhtml+xml' } }, 'HTML request without navigate mode')
net({ url: `${O}/clips/abc`, headers: { rsc: '1' } }, 'RSC request (RSC header)')
net({ url: `${O}/clips/abc?_rsc=1x2y` }, 'RSC request (?_rsc=)')
net({ url: `${O}/clips/abc`, headers: { 'next-router-prefetch': '1', rsc: '1' } }, 'RSC prefetch')
net({ url: `${O}/clips/abc`, headers: { 'next-router-state-tree': '%5B%5D' } }, 'router state tree request')
net({ method: 'POST', url: `${O}/clips/abc`, headers: { 'next-action': 'abc123' } }, 'server action (POST + Next-Action)')
net({ method: 'GET', url: `${O}/clips/abc`, headers: { 'next-action': 'abc123' } }, 'Next-Action header on a GET')
net({ method: 'POST', url: `${O}/_next/static/chunks/a.js` }, 'any non-GET, even to a static path')
net({ method: 'PUT', url: `${O}/logo.png` }, 'PUT to an image path')
net({ url: `${O}/api/ai-chat` }, '/api')
net({ url: `${O}/api/clips/1/logo.png` }, '/api path ending in .png')
net({ url: `${O}/auth/login` }, '/auth')
net({ url: `${O}/auth/callback?code=x` }, '/auth callback')
net({ url: `${O}/_next/image?url=%2Fx.jpg&w=640&q=75` }, '/_next/image (may proxy private images)')
net({ url: `${O}/dashboard` }, 'plain GET of a page path')
net({ url: `${O}/profile/123` }, 'plain GET of a profile path')
net({ url: 'https://abc.supabase.co/storage/v1/object/sign/clips/x.png' }, 'cross-origin (Supabase storage)')
net({ url: 'not a url' }, 'unparseable URL')

console.log('\n── static assets: cache-first ──────────────────────────────────')
cache({ url: `${O}/_next/static/chunks/main-abc123.js` }, '/_next/static JS chunk')
cache({ url: `${O}/_next/static/css/app.css` }, '/_next/static CSS')
cache({ url: `${O}/_next/static/media/font.woff2` }, '/_next/static font')
cache({ url: `${O}/manifest.webmanifest` }, 'manifest')
cache({ url: `${O}/icon` }, 'generated icon')
cache({ url: `${O}/apple-icon` }, 'generated apple icon')
cache({ url: `${O}/favicon.ico` }, 'favicon')
cache({ url: `${O}/rp-icon.png` }, 'public PNG')
cache({ url: `${O}/media/nolan-windup.jpg` }, 'public JPG')
cache({ url: `${O}/logo.svg` }, 'public SVG')

console.log('\n── shouldStoreResponse ─────────────────────────────────────────')
assert(sw.shouldStoreResponse({ ok: true, status: 200, type: 'basic', cacheControl: 'public, max-age=31536000, immutable' }), 'stores a 200 public response')
assert(!sw.shouldStoreResponse({ ok: true, status: 200, type: 'basic', cacheControl: 'no-store' }), 'respects no-store')
assert(!sw.shouldStoreResponse({ ok: true, status: 200, type: 'basic', cacheControl: 'private, max-age=0' }), 'respects private')
assert(!sw.shouldStoreResponse({ ok: true, status: 200, type: 'basic', cacheControl: 'private, no-cache, no-store, max-age=0, must-revalidate' }), 'respects the app\'s page headers')
assert(!sw.shouldStoreResponse({ ok: true, status: 200, type: 'basic', redirected: true }), 'does not store redirected responses (e.g. to /auth/login)')
assert(!sw.shouldStoreResponse({ ok: false, status: 404, type: 'basic' }), 'does not store errors')
assert(!sw.shouldStoreResponse({ ok: true, status: 206, type: 'basic' }), 'does not store partial content')
assert(!sw.shouldStoreResponse({ ok: true, status: 200, type: 'opaque' }), 'does not store opaque responses')

const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
