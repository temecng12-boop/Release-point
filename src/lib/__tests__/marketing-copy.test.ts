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
