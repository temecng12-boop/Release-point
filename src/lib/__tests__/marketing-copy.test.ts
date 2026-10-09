/**
 * Public marketing pages make no data-import, third-party device, or pricing
 * claims. Imports stay out of the copy until they pass live testing.
 * Reads the page sources (comments included). In-app pages, including the
 * import screens (clips/[id]/metrics-tab.tsx, components/trackman-import.tsx),
 * and the legal pages (privacy, terms) are not checked here.
 * Run with: npx tsx --test src/lib/__tests__/marketing-copy.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

const MARKETING_FILES = [
  'app/page.tsx',
  'app/home/page.tsx',
  'app/about/page.tsx',
  'app/waitlist/page.tsx',
  'app/waitlist/waitlist-form.tsx',
  'app/auth/signup/page.tsx',
  'app/auth/signup/signup-form.tsx',
  'app/layout.tsx',
  'app/manifest.ts',
  'components/SiteFooter.tsx',
  'components/live-stats.tsx',
  'components/pitch-metrics.tsx',
]

const BANNED: [string, RegExp][] = [
  ['TrackMan', /track\s?man/i],
  ['CSV', /\bcsv\b/i],
  ['PDF import', /\bpdf\b/i],
  ['Rapsodo', /rapsodo/i],
  ['Hawk-Eye', /hawk[\s-]?eye/i],
  ['free for coaches', /free\s+for\s+coaches/i],
  ['a price', /\$\s?\d/],
  ['a data-import claim', /\bimport(s|ing)?\s+(pitch|swing|hitting|data|metrics|your)\b|\bdata\s+imports?\b/i],
]

for (const file of MARKETING_FILES) {
  test(`${file}: no import, device or pricing claims`, () => {
    const lines = read(file).split('\n')
    const hits: string[] = []
    lines.forEach((line, i) => {
      for (const [name, re] of BANNED) {
        if (re.test(line)) hits.push(`${file}:${i + 1} ${name}: ${line.trim()}`)
      }
    })
    assert.deepEqual(hits, [])
  })
}

test('the checker catches the claims it looks for', () => {
  const samples = ['TrackMan · CSV · PDF', 'CSV & PDF import', 'Works with Rapsodo', 'Hawk-Eye data', 'Free for coaches', 'Only $9/mo', 'import pitch data files', 'Import pitch metrics']
  for (const s of samples) {
    assert.ok(BANNED.some(([, re]) => re.test(s)), `not caught: ${s}`)
  }
  for (const s of ['Pitching & hitting metrics', "import Link from 'next/link'"]) {
    assert.ok(!BANNED.some(([, re]) => re.test(s)), `false positive: ${s}`)
  }
})

test('about page: no realtime claim, and coach access described with team coaches', () => {
  const about = read('app/about/page.tsx')
  assert.doesNotMatch(about, /instantly|real-time data|the moment a coach saves/i)
  assert.doesNotMatch(about, /coach can only query their own players/i)
  assert.match(about, /players on teams they coach/)
})

test('about page: security and access claims match the code', () => {
  const about = read('app/about/page.tsx')
  // Server reads use the service-role client with checks in code, so no claim
  // that every query is enforced by row-level security.
  assert.doesNotMatch(about, /every database query/i)
  assert.match(about, /checks your access on every request before it shows or changes a player\\'s data/)
  // Service-role (admin) reads skip RLS. Do not claim a second layer of protection:
  // some JWT policies are wider than the app, some are narrower, and expected-policies
  // through 036 is stale vs later drops (037).
  assert.match(about, /Database rules also limit what a signed-in account can read or write if it talks to the database directly/)
  assert.match(about, /Most app writes go through the server and are not limited by those rules/)
  assert.doesNotMatch(about, /second layer of protection/)
  assert.doesNotMatch(about, /protect(s)? every table/i)
  // Who can see a clip: canViewPlayerContent (src/lib/clip-access.ts).
  assert.doesNotMatch(about, /only accessible to that player and their assigned coach/i)
  assert.match(about, /the player, the player\\'s direct coach, the other coaches on teams the player is on \(including assistant coaches\), and the player\\'s linked guardian/)
  const access = read('lib/clip-access.ts')
  for (const via of ["'player'", "'coach'", "'guardian'", "'team_coach'"]) assert.ok(access.includes(via), via)
  // Signed clip links expire after an hour (3600 s) on the clip page.
  assert.match(about, /signed links that expire after an hour/)
  assert.match(read('app/clips/[id]/page.tsx'), /createSignedUrl\(clip\.storage_path, 3600\)/)
  assert.doesNotMatch(about, /real-time collaboration/i)
})
