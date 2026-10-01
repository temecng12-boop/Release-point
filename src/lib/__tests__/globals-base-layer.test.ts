/**
 * globals.css: the element min-height defaults must sit inside `@layer base`.
 * Unlayered rules beat every Tailwind utility, so an unlayered
 * `button, a { min-height: 36px }` silently cancels classes like min-h-11.
 * Run with: npx tsx --test src/lib/__tests__/globals-base-layer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Split the stylesheet into the bodies of `@layer base { … }` blocks and everything else. */
function splitLayers(src: string) {
  const base: string[] = []
  let outside = ''
  let i = 0
  while (i < src.length) {
    const m = /@layer\s+base\s*\{/g
    m.lastIndex = i
    const hit = m.exec(src)
    if (!hit) { outside += src.slice(i); break }
    outside += src.slice(i, hit.index)
    let depth = 1
    let j = hit.index + hit[0].length
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
    }
    assert.equal(depth, 0, 'unbalanced braces in @layer base')
    base.push(src.slice(hit.index + hit[0].length, j - 1))
    i = j
  }
  return { base: base.join('\n'), outside }
}

/** Rules (selector + body) that set min-height, for top-level rules in the given text. */
function minHeightRules(text: string) {
  const out: { selector: string; body: string }[] = []
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/min-height\s*:/.test(m[2])) out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] })
  }
  return out
}

const { base, outside } = splitLayers(css)

test('the button, a { min-height: 36px } default is inside @layer base', () => {
  const rule = minHeightRules(base).find(r => r.selector === 'button, a')
  assert.ok(rule, 'expected a `button, a` rule inside @layer base')
  assert.match(rule.body, /min-height\s*:\s*36px/)
})

test('the header min-height reset is inside @layer base too', () => {
  const rule = minHeightRules(base).find(r => r.selector === 'header a, header button, header span')
  assert.ok(rule, 'expected the header reset inside @layer base')
  assert.match(rule.body, /min-height\s*:\s*unset/)
})

test('no unlayered rule sets min-height on button, a or input elements', () => {
  const offenders = minHeightRules(outside).filter(r =>
    r.selector.split(',').some(s => /(^|[\s>+~])(button|a|input|select|textarea)(\b|$)/.test(s.trim())))
  assert.deepEqual(offenders.map(r => r.selector), [])
})
