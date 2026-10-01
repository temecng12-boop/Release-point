/**
 * QA-017 UI checks: pitch rows leave the table only after the server confirmed
 * the delete, "Delete all" needs a confirm step, and the dashboard clip ✕ is
 * visible and at least 44px on touch screens.
 * Run with: npx tsx --test src/lib/__tests__/pitch-delete-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const between = (src: string, a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)))

test('single pitch delete: checked result, row removed only on success', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  const fn = between(src, 'async function handleDeleteMetric', 'async function handleDeleteAllMetrics')
  const call = fn.indexOf('runAction(() => deletePitchMetric(id))')
  const bail = fn.indexOf('if (!result.ok) { setMetricDeleteError(')
  const drop = fn.indexOf('updateMetrics(prev => prev.filter(m => m.id !== id))')
  assert.ok(call > 0 && bail > call && drop > bail, fn)
  assert.match(src, /metricDeleteError && <p role="alert"/)
})

test('delete all: only from the confirm step, and only removes the ids the server deleted', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  const fn = between(src, 'async function handleDeleteAllMetrics', '// ── Handle file selection')
  assert.ok(fn.indexOf('if (!result.ok)') < fn.indexOf('updateMetrics('))
  assert.match(fn, /removedIds/)
  // The header button only opens the confirm; the confirm's button runs the delete.
  assert.match(src, /onClick=\{\(\) => \{ setConfirmAll\(true\); setMetricDeleteError\(null\) \}\}/)
  assert.equal((src.match(/onClick=\{handleDeleteAllMetrics\}/g) ?? []).length, 1)
  assert.ok(src.indexOf('{confirmAll && (') < src.indexOf('onClick={handleDeleteAllMetrics}'))
})

test('pitch delete buttons are at least 44px (beat the global button min-height)', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  const row = between(src, 'onClick={() => handleDeleteMetric(m.id)}', '</button>')
  assert.match(row, /!min-h-11 !min-w-11/)
  assert.match(row, /aria-label=/)
})

test('dashboard clip ✕: visible without hover on touch screens, 44px tap target', () => {
  const src = read('app/dashboard/player-row.tsx')
  const btn = between(src, 'onClick={() => setConfirmClip(clip.id)}', '</button>')
  // Hidden-until-hover only where hover exists (mouse); never a bare opacity-0.
  assert.match(btn, /\[@media\(hover:hover\)\]:opacity-0 \[@media\(hover:hover\)\]:group-hover:opacity-100/)
  assert.doesNotMatch(btn, /(^|\s)opacity-0(\s|")/)
  assert.match(btn, /\[@media\(pointer:coarse\)\]:!min-h-11 \[@media\(pointer:coarse\)\]:!min-w-11/)
  assert.match(btn, /aria-label=\{`Delete clip \$\{clip\.title\}`\}/)
})
