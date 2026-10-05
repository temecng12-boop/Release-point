/**
 * The header's unlayered `display: inline-flex` rule must not override
 * Tailwind's `hidden` (the iPhone header overlap: the wordmark, the
 * breadcrumb links and the dashboard name showed on phones on top of each
 * other). Checked in a real browser in shots-pr-a/header-iphone-*.png.
 * Run with: npx tsx --test src/lib/__tests__/header-hidden.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

test('every unlayered header display rule skips .hidden', () => {
  const rules = [...css.matchAll(/([^{}]*header[^{}]*)\{([^}]*display\s*:[^}]*)\}/g)]
  assert.ok(rules.length > 0)
  for (const [, selector] of rules) {
    for (const part of selector.split(',').map((s) => s.trim()).filter((s) => /^header\b/.test(s))) {
      assert.match(part, /:not\(\.hidden\)/, part)
    }
  }
})

test('the header still hides the wordmark and secondary links on phones', () => {
  const header = readFileSync(join(__dirname, '..', '..', 'components', 'app-header.tsx'), 'utf8')
  assert.match(header, /wordmarkClass="hidden md:inline"/)
  assert.match(header, /hidden sm:inline/)
})

test('a linked breadcrumb hides with its separator on phones (no "/ /")', () => {
  const header = readFileSync(join(__dirname, '..', '..', 'components', 'app-header.tsx'), 'utf8')
  assert.match(header, /crumb\.href \? 'hidden sm:inline-flex' : 'flex'/)
})
