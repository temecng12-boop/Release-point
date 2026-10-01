/**
 * Report a problem UI structure (review of #23). globals.css has unlayered
 * min-height rules for buttons/links, and a header-wide `min-height: unset`,
 * that beat Tailwind's layered min-h-* utilities. So:
 *  - the dialog must be portaled to document.body (not rendered in <header>),
 *  - every tap target must use the important min-height variants.
 * Run with: npx tsx --test src/lib/__tests__/report-problem-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/report-problem.tsx', import.meta.url), 'utf8')

/** The opening tag text (attributes included) of each <button ...>. */
function buttons(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/<button\b/g)) {
    let depth = 0
    let i = m.index!
    for (; i < code.length; i++) {
      const c = code[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push(code.slice(m.index!, i + 1))
  }
  return out
}

test('the dialog is portaled to document.body, client-only', () => {
  assert.match(src, /import \{ createPortal \} from 'react-dom'/)
  assert.match(src, /isClient && createPortal\(\s*<dialog\b/)
  assert.match(src, /<\/dialog>,\s*document\.body,?\s*\)/)
  // No <dialog> outside the portal call.
  assert.equal((src.match(/<dialog\s/g) ?? []).length, 1)
  // SSR-safe: false on the server snapshot.
  assert.match(src, /useSyncExternalStore\(noopSubscribe, \(\) => true, \(\) => false\)/)
  // Focus goes back to the header button on close; Esc/focus trap come from showModal().
  assert.match(src, /showModal\(\)/)
  assert.match(src, /triggerRef\.current\?\.focus\(\)/)
})

test('the header button is a 44x44 tap target that beats the global header rule', () => {
  const trigger = buttons(src).find(b => b.includes('ref={triggerRef}'))
  assert.ok(trigger, 'header trigger button not found')
  assert.match(trigger!, /!min-h-11/)
  assert.match(trigger!, /!min-w-11/)
})

test('Close, ×, Remove and Send are at least 44px tall (important min-h-11/12)', () => {
  const all = buttons(src)
  assert.equal(all.length, 5, 'trigger, ×, Remove, Close, Send')
  for (const b of all) assert.match(b, /!min-h-1[12]\b/, b)
  // The file input's own button is a pseudo-element the global rule doesn't touch.
  assert.match(src, /file:min-h-11/)
})
