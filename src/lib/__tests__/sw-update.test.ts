/**
 * "New version available" prompt: never an automatic reload.
 * Run with: npx tsx --test src/lib/__tests__/sw-update.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { watchSwUpdate } from '../sw-update'

function sw(controller: unknown) {
  const ls: (() => void)[] = []
  return { controller, addEventListener: (_: string, f: () => void) => { ls.push(f) }, removeEventListener: (_: string, f: () => void) => { ls.splice(ls.indexOf(f), 1) }, fire: () => ls.slice().forEach(f => f()), ls }
}

test('a new worker taking over a controlled page shows the prompt once', () => {
  const s = sw({}); let n = 0
  const off = watchSwUpdate(s, () => { n++ })
  s.fire(); s.fire()
  assert.equal(n, 1)
  off(); assert.equal(s.ls.length, 0)
})

test('first install (no controller at load) is not an update; a later takeover is', () => {
  const s = sw(null); let n = 0
  watchSwUpdate(s, () => { n++ })
  s.fire(); assert.equal(n, 0)
  s.fire(); assert.equal(n, 1)
})

test('nothing reloads by itself: reload only in the banner button handler', () => {
  const lib = readFileSync(new URL('../sw-update.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(lib.replace(/\/\/.*$/gm, ''), /reload\(/)
  const banner = readFileSync(new URL('../../components/sw-update-banner.tsx', import.meta.url), 'utf8')
  assert.equal(banner.match(/location\.reload\(\)/g)?.length, 1)
  assert.match(banner, /onClick=\{\(\) => window\.location\.reload\(\)\}/)
  assert.match(banner, /aria-label="Dismiss"/)
  assert.match(banner, /role="status"/)
})
