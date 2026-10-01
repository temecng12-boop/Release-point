/**
 * Context captured with a report.
 * Run with: npx tsx --test src/lib/__tests__/feedback-capture.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appVersion, captureFromWindow, clipIdFromPath, parseUserAgent, routeFor, sanitizeContext } from '../feedback/capture'

const CLIP = '33333333-3333-4333-8333-333333333333'

test('route patterns and clip id', () => {
  assert.equal(routeFor(`/clips/${CLIP}`), '/clips/[id]')
  assert.equal(routeFor('/clips/compare'), '/clips/compare')
  assert.equal(routeFor(`/profile/${CLIP}`), '/profile/[id]')
  assert.equal(routeFor('/dashboard/team/42'), '/dashboard/team/[id]')
  assert.equal(routeFor('/'), '/')
  assert.equal(clipIdFromPath(`/clips/${CLIP.toUpperCase()}`), CLIP)
  assert.equal(clipIdFromPath(`/clips/${CLIP}/edit`), CLIP)
  assert.equal(clipIdFromPath('/clips/compare'), null)
  assert.equal(clipIdFromPath(`/profile/${CLIP}`), null)
})

test('user agents: iPhone Safari, iOS Chrome, Android Chrome, desktop browsers', () => {
  const cases: [string, { device: string; os: string; browser: string }][] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', { device: 'iPhone', os: 'iOS 18.6', browser: 'Safari 18.6' }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1', { device: 'iPhone', os: 'iOS 17.5', browser: 'Chrome 128 (iOS)' }],
    ['Mozilla/5.0 (iPad; CPU OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1', { device: 'iPad', os: 'iOS 16.3', browser: 'Safari 16.3' }],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', { device: 'Android phone', os: 'Android 14', browser: 'Chrome 129' }],
    ['Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36', { device: 'Android tablet', os: 'Android 13', browser: 'Samsung Internet 25' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', { device: 'Desktop', os: 'Windows 10/11', browser: 'Edge 130' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', { device: 'Desktop', os: 'macOS 10.15', browser: 'Safari 18.1' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', { device: 'Desktop', os: 'Linux', browser: 'Firefox 131' }],
  ]
  for (const [ua, want] of cases) assert.deepEqual(parseUserAgent(ua), want, ua)
  assert.deepEqual(parseUserAgent(null), { device: 'Desktop', os: 'Unknown', browser: 'Unknown' })
})

test('browser capture and server sanitizing', () => {
  const w = { location: { href: `https://releasepointai.com/clips/${CLIP}?t=3`, pathname: `/clips/${CLIP}` }, innerWidth: 390, innerHeight: 664, devicePixelRatio: 3 }
  const c = captureFromWindow(w)
  assert.deepEqual(c, { pageUrl: w.location.href, route: '/clips/[id]', clipId: CLIP, viewportW: 390, viewportH: 664, pixelRatio: 3 })
  assert.deepEqual(sanitizeContext(c, 'https://releasepointai.com'), c)
  // Route and clip id come from the URL, not from what the browser claims.
  const s = sanitizeContext({ ...c, route: '/admin', clipId: 'x', viewportW: -1, viewportH: 1e9, pixelRatio: 'x' }, 'https://releasepointai.com')
  assert.deepEqual([s.route, s.clipId, s.viewportW, s.viewportH, s.pixelRatio], ['/clips/[id]', CLIP, null, null, null])
  // Other origins and odd schemes are dropped.
  assert.equal(sanitizeContext({ pageUrl: 'https://evil.example/x' }, 'https://releasepointai.com').pageUrl, '')
  assert.equal(sanitizeContext({ pageUrl: 'javascript:alert(1)' }, null).pageUrl, '')
  assert.equal(sanitizeContext({ pageUrl: 'https://a.b/' + 'x'.repeat(5000) }, null).pageUrl.length, 2048)
  assert.deepEqual(sanitizeContext(null, null), { pageUrl: '', route: '/', clipId: null, viewportW: null, viewportH: null, pixelRatio: null })
})

test('app version: commit SHA from Vercel, else a clear fallback', () => {
  assert.equal(appVersion({ VERCEL_GIT_COMMIT_SHA: '44ed6351234567890abcdef1234567890abcdef0', VERCEL_ENV: 'production' }), '44ed63512345 (production)')
  assert.equal(appVersion({ GIT_COMMIT_SHA: 'abc1234' }), 'abc1234')
  assert.equal(appVersion({ NODE_ENV: 'development' }), 'unknown (local dev)')
  assert.equal(appVersion({ VERCEL_GIT_COMMIT_SHA: 'not a sha', VERCEL_ENV: 'preview' }), 'unknown (preview)')
})
