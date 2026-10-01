/**
 * QA-012: signing out ends only this device's session. Every signOut call
 * names its scope; only account deletion signs out everywhere.
 * Run with: npx tsx --test src/lib/__tests__/signout-scope.test.ts
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
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

test('every auth signOut call has an explicit scope; global only in deleteAccount', () => {
  const calls: { file: string; scope: string; inDelete: boolean }[] = []
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/\.auth\.signOut\(([^)]*)\)/g)) {
      const scope = m[1].match(/scope:\s*'(\w+)'/)?.[1] ?? 'default'
      const before = src.slice(0, m.index)
      const fn = [...before.matchAll(/export async function (\w+)/g)].pop()?.[1]
      calls.push({ file: f.slice(root.length), scope, inDelete: fn === 'deleteAccount' })
    }
  }
  assert.ok(calls.length >= 4, JSON.stringify(calls))
  for (const c of calls) {
    assert.notEqual(c.scope, 'default', `${c.file}: signOut must name its scope`)
    assert.equal(c.scope, c.inDelete ? 'global' : 'local', `${c.file}: ${c.scope}`)
  }
  assert.equal(calls.filter(c => c.scope === 'global').length, 1)
})
