/**
 * players.consent_given_at means a guardian gave consent. Only the guardian
 * consent form (recordConsent in src/app/actions/guardian.ts) may write it;
 * signup, invite linking, onboarding and other code must not stamp it.
 * This scans src/ (not tests) for every mention of consent_given_at and fails
 * on anything that isn't a read: a type field, a select/column string, a
 * property read (row.consent_given_at) or a comment.
 * Run with: npx tsx --test src/lib/__tests__/consent-writes.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(n) ? [p] : []
  })
}

/** The only places allowed to write consent_given_at: file -> function. */
const ALLOWED_WRITERS: Record<string, string> = {
  'app/actions/guardian.ts': 'recordConsent',
}

type Hit = { file: string; line: number; text: string; fn: string | undefined }

/** Mentions of consent_given_at that are not plainly reads. */
export function suspectWrites(file: string, src: string): Hit[] {
  const hits: Hit[] = []
  const lines = src.split('\n')
  lines.forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, '')
    if (/^\s*(\*|\/\*)/.test(code)) return // block comment line
    for (const m of code.matchAll(/consent_given_at/g)) {
      const before = code.slice(0, m.index)
      const after = code.slice(m.index! + 'consent_given_at'.length)
      // Type field: consent_given_at: string | null / ?: string
      if (/^\??\s*:\s*(string|null|Date)\b/.test(after)) continue
      // Property read: row.consent_given_at / row?.consent_given_at (not assigned)
      if (/\??\.$/.test(before) && !/^\s*=(?!=)/.test(after)) continue
      // Inside a column-list string ('a, consent_given_at' / `${x}, consent_given_at`),
      // unless the string is used as an object key or computed key.
      const quotes = (before.match(/['"`]/g) ?? []).length
      if (quotes % 2 === 1 && !/^['"`]\s*\]?\s*:/.test(after) && !/\[\s*['"`]$/.test(before)) continue
      const upTo = lines.slice(0, i).join('\n') + '\n' + before
      const fn = [...upTo.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)].pop()?.[1]
      hits.push({ file, line: i + 1, text: raw.trim(), fn })
    }
  })
  return hits
}

test('only the guardian consent form writes consent_given_at', () => {
  const bad: Hit[] = []
  let allowed = 0
  for (const f of files(root)) {
    const rel = f.slice(root.length)
    for (const h of suspectWrites(rel, readFileSync(f, 'utf8'))) {
      if (ALLOWED_WRITERS[rel] && ALLOWED_WRITERS[rel] === h.fn) allowed++
      else bad.push(h)
    }
  }
  assert.deepEqual(bad, [], 'consent_given_at written outside the guardian consent form')
  assert.equal(allowed, 1, 'recordConsent should still write consent_given_at exactly once')
})

test('the scanner flags writes and ignores reads', () => {
  const writes = [
    `.update({ position, consent_given_at: new Date().toISOString() })`,
    `.insert({ user_id: id, consent_given_at: now })`,
    `const row = { consent_given_at }`,
    `.update({ 'consent_given_at': now })`,
    `.update({ ['consent_given_at']: now })`,
    `row.consent_given_at = now`,
  ]
  for (const w of writes) assert.equal(suspectWrites('x.ts', `function f() {\n${w}\n}`).length, 1, w)

  const reads = [
    `.select('id, full_name, consent_given_at')`,
    'const r = await run(`${columns}, consent_given_at`)',
    `  consent_given_at: string | null`,
    `  consent_given_at?: string | null`,
    `if (player.consent_given_at) return 'guardian_consent'`,
    `if (row?.consent_given_at === null) return`,
    `// stamps consent_given_at`,
    ` * players.consent_given_at set when a guardian has given consent`,
  ]
  for (const r of reads) assert.equal(suspectWrites('x.ts', r).length, 0, r)
})
