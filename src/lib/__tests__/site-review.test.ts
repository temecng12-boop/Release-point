/**
 * Site-review freeze fixes (Oct 2026): domain, viewports, hero SSR numbers,
 * social preview, canonicals, titles, legal consistency, sport/AI wording,
 * Apple flag, and stop-message copy. Reads page sources (comments included).
 * Run with: npx tsx --test src/lib/__tests__/site-review.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const src = (p: string) => readFileSync(join(repo, 'src', p), 'utf8')
const read = (p: string) => src(p).replace(/\\'/g, "'")

// ── Domain ───────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'uploads', 'shots-site-review', '.cursor'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm'])
const OLD_DOMAIN = 'releasepoint' + '.app'

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if ([...SKIP_EXT].some((x) => p.endsWith(x))) continue
    out.push(p)
  }
  return out
}

test('domain: zero old-domain hits across the repo', () => {
  const hits: string[] = []
  for (const f of walk(repo)) {
    let text: string
    try { text = readFileSync(f, 'utf8') } catch { continue }
    if (text.includes('\0')) continue
    text.split('\n').forEach((line, i) => {
      if (line.includes(OLD_DOMAIN)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('domain: legal contacts use releasepointai.com', () => {
  assert.match(read('app/privacy/page.tsx'), /privacy@releasepointai\.com/)
  assert.match(read('app/terms/page.tsx'), /legal@releasepointai\.com/)
  assert.match(read('lib/privacy-children.ts'), /privacy@releasepointai\.com/)
  assert.match(read('lib/stop-message.ts'), /privacy@releasepointai\.com/)
  for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) {
    assert.doesNotMatch(read(f), /privacy@releasepoint\.app|legal@releasepoint\.app/)
  }
})

// ── Viewport ─────────────────────────────────────────────────────────────────

test('viewport: marketing/legal allow pinch-zoom, clip routes restrict it', () => {
  const root = src('app/layout.tsx')
  assert.doesNotMatch(root, /maximumScale|userScalable/)
  for (const f of ['app/clips/[id]/page.tsx', 'app/clips/compare/page.tsx']) {
    assert.match(read(f), /maximumScale:\s*1/, f)
  }
})

// ── Hero SSR numbers ─────────────────────────────────────────────────────────

test('hero: server-rendered stats are the real example numbers, not 0', () => {
  const live = src('components/live-stats.tsx')
  assert.match(live, /useState\(value\)/)
  assert.doesNotMatch(live, /useState\(0\)/)
  for (const n of ['93', '2480', '18.2', '6.4', '94']) assert.ok(live.includes(n), n)
  const metrics = src('components/pitch-metrics.tsx')
  assert.match(metrics, /useState\(m\.num \?\? 0\)/)
  assert.doesNotMatch(metrics, /useState\(0\)/)
})

// ── Social preview ───────────────────────────────────────────────────────────

test('social: og:image 1200x630 with summary_large_image', () => {
  const layout = src('app/layout.tsx')
  const meta = src('lib/site-meta.ts')
  assert.match(layout, /summary_large_image/)
  assert.match(layout, /OG_IMAGE_URL/)
  assert.ok(meta.includes("OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`"))
  assert.ok(meta.includes("OG_IMAGE_PATH = '/opengraph-image'"))
  assert.ok(meta.includes('OG_IMAGE_WIDTH = 1200') && meta.includes('OG_IMAGE_HEIGHT = 630'))
  assert.ok(meta.includes('OG_IMAGE_ALT = \'Release Point AI: video coaching for pitchers and hitters\''))
  assert.match(layout, /width: OG_IMAGE_WIDTH/)
  assert.match(layout, /height: OG_IMAGE_HEIGHT/)
  assert.match(layout, /alt: OG_IMAGE_ALT/)
  // Generated in code at build time (navy/red/white, logo, tagline, /media
  // frame) — the old-tagline PNG is not shipped.
  const route = src('app/opengraph-image.tsx')
  assert.match(route, /width: 1200/)
  assert.match(route, /height: 630/)
  assert.match(route, /See Every/)
  assert.match(route, /nolan-windup\.jpg/)
  assert.match(route, /#C8031E/)
  assert.ok(!existsSync(join(repo, 'public', 'og-image.png')), 'old PNG not shipped')
})

// ── Canonical / titles / brand ───────────────────────────────────────────────

test('canonical + og:url per page, metadataBase on the domain', () => {
  assert.match(src('app/layout.tsx'), /metadataBase: new URL\(SITE_URL\)/)
  // Route segments extend the parent openGraph (Next shallow-merges it, so a
  // bare openGraph.url would wipe the social image).
  assert.match(src('lib/site-meta.ts'), /alternates: \{ canonical: canonicalPath \}/)
  assert.match(src('lib/site-meta.ts'), /openGraph: \{ \.\.\.prev\.openGraph, url: canonicalPath \}/)
  const pages: [string, string][] = [
    ['app/page.tsx', '/'],
    ['app/home/page.tsx', '/home'],
    ['app/about/page.tsx', '/about'],
    ['app/privacy/page.tsx', '/privacy'],
    ['app/terms/page.tsx', '/terms'],
    ['app/waitlist/page.tsx', '/waitlist'],
  ]
  for (const [f, path] of pages) {
    assert.match(read(f), new RegExp(`pageMetadata\\('${path}', parent`), `${f} canonical + og:url`)
  }
})

test('title: Release Point AI, never doubled', () => {
  const layout = src('app/layout.tsx')
  assert.match(layout, /default: "Release Point AI"/)
  assert.match(layout, /template: "%s \| Release Point AI"/)
  assert.match(read('app/waitlist/page.tsx'), /title: 'Join the Waitlist'/)
  assert.match(read('app/auth/signup/page.tsx'), /title: 'Internal testing'/)
  for (const f of ['app/waitlist/page.tsx', 'app/auth/signup/page.tsx', 'app/about/page.tsx']) {
    assert.doesNotMatch(read(f), /· Release Point'/, `${f} no brand suffix in title`)
  }
  assert.match(read('app/waitlist/page.tsx'), /Release Point AI\. All rights reserved/)
  assert.match(read('app/manifest.ts'), /name: 'Release Point AI'/)
})

// ── Legal consistency ────────────────────────────────────────────────────────

test('legal entity placeholder is one exported constant', () => {
  assert.match(src('lib/site-meta.ts'), /LEGAL_ENTITY_PLACEHOLDER = '\[LEGAL_ENTITY_NAME\]'/)
  assert.match(read('app/privacy/page.tsx'), /LEGAL_ENTITY_PLACEHOLDER\}, a Nevada LLC, once formed/)
  assert.match(read('app/terms/page.tsx'), /LEGAL_ENTITY_PLACEHOLDER\}, a Nevada LLC, once formed/)
})

test('governing law is Nevada, operator named', () => {
  for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) {
    assert.match(read(f), /laws of the State of Nevada and applicable U\.S\. federal law/, f)
  }
  assert.doesNotMatch(read('app/terms/page.tsx'), /laws of the United States/)
  assert.match(read('app/terms/page.tsx'), /operated by \$\{OPERATOR_NAME\}/)
  assert.match(read('app/privacy/page.tsx'), /operated by Nolan George/)
  assert.match(src('lib/site-meta.ts'), /OPERATOR_NAME = 'Nolan George'/)
})

test('under-13 policy is one identical block on privacy and terms', () => {
  // The block lives once in lib/privacy-children.ts; both pages render it.
  assert.match(read('app/terms/page.tsx'), /\$\{UNDER_13_POLICY_BODY\}/)
  assert.match(read('app/privacy/page.tsx'), /CHILDREN_AND_TEENS_BODY/)
  assert.match(read('lib/privacy-children.ts'), /\$\{UNDER_13_POLICY_BODY\}/)
  const block = read('lib/privacy-children.ts')
  for (const line of [
    /There are no users under 13\. Until parent accounts ship/,
    /Children under 13 cannot sign up\./,
    /signup stops and no account is created\. We don't save the child's name or email/,
    /an under-13 answer deletes the new account and its name and email/,
    /Coaches cannot add players under 13, and a coach can't give permission on behalf of a parent or guardian/,
    /No video can be uploaded for anyone marked under 13/,
    /we'll freeze it right away\. No one can use it or add to it\. We'll then delete the child's personal information, including video, within 14 days/,
    /Players 13 to 17 need a parent's or guardian's permission to use Release Point/,
    /Coaches must have written parent or guardian consent before uploading video of any minor/,
  ]) assert.match(block, line)
})

test('who can see video reads identically on about, privacy, and terms', () => {
  const sentence =
    "A player's video can be seen by the player, the player's direct coach, " +
    "and the other coaches on teams the player is on."
  // Privacy keeps the Children and Teens copy in its own module (easy swap).
  const privacy = read('app/privacy/page.tsx') + '\n' + read('lib/privacy-children.ts')
  assert.ok(read('app/about/page.tsx').includes(sentence), 'about viewer sentence')
  assert.ok(privacy.includes(sentence), 'privacy viewer sentence')
  assert.ok(read('app/terms/page.tsx').includes(sentence), 'terms viewer sentence')
})

test('privacy collects birth month/year, Google/Apple, parent accounts, and reports', () => {
  const privacy = read('app/privacy/page.tsx')
  assert.match(privacy, /birth month and year/)
  assert.match(privacy, /never stored/)
  assert.match(privacy, /Sign-in with Google or Apple/)
  assert.match(privacy, /Parent or guardian accounts \(once parent accounts launch\)/)
  assert.match(privacy, /Problem reports:/)
  assert.match(privacy, /Vercel.*Hosts the Release Point AI website/)
  assert.match(privacy, /Resend.*notifications@releasepointai\.com/)
})

// ── Sport / AI / pricing wording ─────────────────────────────────────────────

test('sport: zero banned-sport mentions across the repo', () => {
  const needle = 'soft' + 'ball'
  const hits: string[] = []
  for (const f of walk(repo)) {
    let text: string
    try { text = readFileSync(f, 'utf8') } catch { continue }
    if (text.includes('\0')) continue
    text.split('\n').forEach((line, i) => {
      if (line.toLowerCase().includes(needle)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('sport: baseball only on legal pages, baseball-led marketing and meta', () => {
  assert.match(read('app/privacy/page.tsx'), /is a baseball pitching and hitting development app/)
  assert.match(read('lib/privacy-children.ts'), /is a baseball pitching and hitting development app/)
  assert.match(read('app/terms/page.tsx'), /who coaches baseball may create a coach account/)
  assert.match(read('app/page.tsx'), /baseball/)
  assert.match(read('app/layout.tsx'), /Baseball/)
})

test('AI wording is honest; Barry stays; no pro-career claims', () => {
  assert.match(read('app/about/page.tsx'), /Both run on Anthropic's Claude, set up with baseball biomechanics and pitching and hitting metric frameworks, and given the full context of each clip/)
  assert.match(read('app/terms/page.tsx'), /AI Coach is powered by Anthropic's Claude/)
  assert.match(read('app/privacy/page.tsx'), /AI Coach runs on Anthropic's Claude/)
  assert.match(read('app/privacy/page.tsx'), /Video and audio files are never sent/)
  assert.match(read('app/privacy/page.tsx'), /does not train models on customer content.*anthropic\.com\/legal\/commercial-terms/)
  assert.doesNotMatch(read('app/about/page.tsx'), /trained with deep baseball biomechanics/i)
  assert.match(read('app/about/page.tsx'), /Boise Hawks in the Pioneer League/)
  assert.doesNotMatch(read('app/about/page.tsx'), /decade of firsthand/)
  assert.match(read('app/about/page.tsx'), /lifetime on the mound/)
  assert.match(read('app/about/page.tsx'), /Barry/)
  assert.match(read('app/about/page.tsx'), /database rules add a second layer of protection on direct access/)
  assert.doesNotMatch(read('app/about/page.tsx'), /on most direct access/)
})

test('no pricing anywhere on legal or marketing pages', () => {
  for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx', 'app/waitlist/page.tsx', 'app/page.tsx', 'app/about/page.tsx']) {
    assert.doesNotMatch(read(f), /\$\s?\d/, `${f} no price`)
    assert.doesNotMatch(read(f), /free for coaches/i, `${f} no free claim`)
  }
})

// ── Apple flag / stop message ────────────────────────────────────────────────

test('Apple sign-in hidden behind a default-off flag; Google untouched', () => {
  assert.match(src('lib/site-meta.ts'), /APPLE_SIGNIN_ENABLED = false/)
  assert.match(read('app/auth/login/page.tsx'), /APPLE_SIGNIN_ENABLED &&/)
  assert.match(read('app/auth/signup/signup-form.tsx'), /APPLE_SIGNIN_ENABLED/)
  assert.match(read('app/auth/login/page.tsx'), /Continue with Google/)
  assert.match(read('app/auth/signup/signup-form.tsx'), /Continue with Google/)
})

test('no internal review markers ship in page copy', () => {
  for (const f of ['app/privacy/page.tsx', 'lib/privacy-children.ts', 'app/terms/page.tsx', 'app/about/page.tsx', 'app/page.tsx', 'app/waitlist/page.tsx', 'app/waitlist/waitlist-form.tsx', 'lib/stop-message.ts']) {
    assert.doesNotMatch(src(f.replace(/^app\//, 'app/')), /CONFIRM LIVE|BUILD VERIFY|legal advice|licensed attorney/, `${f} no markers`)
  }
})

test('repo: zero review-role notes', () => {
  const needle = 'law' + 'yer'
  const hits: string[] = []
  for (const f of walk(repo)) {
    let text: string
    try { text = readFileSync(f, 'utf8') } catch { continue }
    if (text.includes('\0')) continue
    text.split('\n').forEach((line, i) => {
      if (line.toLowerCase().includes(needle)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('seo: robots, sitemap, branded 404 for unknown URLs', () => {
  const robots = src('app/robots.ts')
  for (const p of ['/auth', '/dashboard', '/clips', '/onboarding', '/api']) assert.ok(robots.includes(`'${p}'`), `robots disallows ${p}`)
  assert.match(robots, /sitemap\.xml/)
  const sitemap = src('app/sitemap.ts')
  for (const p of ['/', '/about', '/waitlist', '/privacy', '/terms']) assert.ok(sitemap.includes(`'${p}'`), `sitemap has ${p}`)
  assert.doesNotMatch(sitemap, /'\/home'/)
  const middleware = src('middleware.ts')
  assert.match(middleware, /isKnownPath/)
  assert.match(middleware, /branded 404/)
  const notFound = src('app/not-found.tsx')
  assert.match(notFound, /Page Not Found/)
  assert.match(notFound, /Logo/)
})

test('stop message points to a parent or guardian, never a coach', () => {
  const file = src('lib/stop-message.ts')
  const m = file.match(/AGE_STOP_MESSAGE =\s*"([^"]+)"/)
  assert.ok(m, 'stop message literal found')
  const msg = m[1]
  assert.match(msg, /parent's or guardian's permission/)
  assert.match(msg, /privacy@releasepointai\.com/)
  assert.doesNotMatch(msg, /coach/i)
  assert.doesNotMatch(msg, /\b13\b/)
})
