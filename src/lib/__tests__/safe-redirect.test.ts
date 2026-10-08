/**
 * safeRedirectPath: only same-origin paths starting with exactly one '/'.
 * Run with: npx tsx --test src/lib/__tests__/safe-redirect.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirectPath } from '../safe-redirect'

const ORIGIN = 'https://releasepointai.com'

const GOOD = [
  '/dashboard',
  '/onboarding',
  '/guardian',
  '/clips/33333333-3333-4333-8333-333333333333',
  '/clips/compare?a=1&b=yt%3Aabc',
  '/profile#settings',
  '/a/b/c?x=%20y',
  '/',
  // an encoded '/' inside a path segment or query value
  '/foo%2Fbar',
  '/clips?return=%2Fdashboard',
  '/clips/compare?a=yt%3Aabc%2Fdef&b=1',
  '/players/a%2Fb/edit',
]

const BAD: unknown[] = [
  // protocol-relative and backslash tricks
  '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com', '\\/evil.com', '/foo\\bar', '/a\\',
  // schemes
  'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  'http://evil.com', 'https://evil.com/dashboard', 'https:evil.com', 'ftp://evil.com', 'mailto:a@b.c',
  // not a path
  'dashboard', 'evil.com', '@evil.com', '.evil.com', '?next=/x', '#x', '',
  // encoded variants
  '/%2F%2Fevil.com', '/%2f%2fevil.com', '%2F%2Fevil.com', '/%5Cevil.com', '/%5cevil.com', '%5C%5Cevil.com',
  '/%252F%252Fevil.com', '/%255Cevil.com', '/%E0%A4%A', '/%09/evil.com', '/%0d%0a/evil.com',
  // encoded '/' that decodes to '//', '/\\', a scheme or a backslash
  '/%2Fevil.com', '/%2fevil.com', '/%2F/evil.com', '/foo%2F%2Fbar', '/foo/%2F/bar', '/%2F%5Cevil.com',
  '/%2F%255Cevil.com', '/x?u=https%3A%2F%2Fevil.com', '/x?u=%2F%2Fevil.com', '/%252Fevil.com',
  '/%25252F%25252Fevil.com', '/%2525252F%2525252Fevil.com', '/a%2F%5Cb', '/a%2Fb%5C', '/%2525252525E0',
  // leading whitespace and control characters
  ' /dashboard', '\t/dashboard', '\n//evil.com', '\u0000/dashboard', '/\t/evil.com', '/\n/evil.com',
  '/\r\n/evil.com', '/dash\u007fboard', '\u0001javascript:alert(1)',
  // non-strings
  null, undefined, 42, ['/dashboard'], { next: '/dashboard' },
]

test('allowed paths come back unchanged', () => {
  for (const p of GOOD) {
    assert.equal(safeRedirectPath(p, '/dashboard', ORIGIN), p, String(p))
    assert.equal(safeRedirectPath(p), p, `${p} (default origin)`)
  }
})

test('everything else falls back', () => {
  for (const p of BAD) {
    assert.equal(safeRedirectPath(p, '/dashboard', ORIGIN), '/dashboard', JSON.stringify(p))
    assert.equal(safeRedirectPath(p), '/dashboard', `${JSON.stringify(p)} (default origin)`)
  }
})

test('results always resolve to the same origin', () => {
  for (const p of [...GOOD, ...BAD]) {
    const r = safeRedirectPath(p, '/dashboard', ORIGIN)
    assert.equal(new URL(r, ORIGIN).origin, ORIGIN, JSON.stringify(p))
  }
})

test('custom fallback', () => {
  assert.equal(safeRedirectPath('//evil.com', '/auth/login'), '/auth/login')
  assert.equal(safeRedirectPath(null, '/guardian'), '/guardian')
})

test('auth/confirm and auth/callback read ?next only through safeRedirectPath', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['../../app/auth/confirm/route.ts', '../../app/auth/callback/route.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    const reads = src.match(/searchParams\.get\('next'\)/g) ?? []
    const safe = src.match(/safeRedirectPath\(searchParams\.get\('next'\)/g) ?? []
    assert.ok(reads.length > 0 && reads.length === safe.length, f)
  }
})

test('every redirect that uses next goes through safeRedirectPath at the point of use', async () => {
  const { readFileSync } = await import('node:fs')
  const files = {
    '../../app/auth/confirm/route.ts': /NextResponse\.redirect\(/,
    '../../app/auth/callback/route.ts': /NextResponse\.redirect\(/,
  }
  let checked = 0
  for (const [f, sink] of Object.entries(files)) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    for (const line of src.split('\n').filter(l => sink.test(l) && /\bnext\b/.test(l))) {
      checked++
      // postAcceptRedirect takes the already-sanitized value, so it counts as wrapped too.
      const uses = line.replace(/[&?]next=/g, '').replace(/postAcceptRedirect\(next,/g, 'postAcceptRedirect(SAFE,').match(/\bnext\b/g) ?? []
      assert.equal(uses.length, (line.match(/safeRedirectPath\(next, /g) ?? []).length, `${f}: ${line.trim()}`)
    }
  }
  assert.equal(checked, 2)
})
