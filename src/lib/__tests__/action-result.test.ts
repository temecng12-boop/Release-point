/**
 * runAction: a returned { error } and a request that never reached the server
 * both come back as { ok: false }, so the UI keeps its state and shows the
 * error. Plus marksAfterClear (Clear marks).
 * Run with: npx tsx --test src/lib/__tests__/action-result.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAction, CONNECTION_ERROR, isNextNavigationSignal } from '../action-result'
import { marksAfterClear } from '../mark-clear'

test('returned { error } -> not ok, with that message', async () => {
  assert.deepEqual(await runAction(async () => ({ error: 'Not authorized' })), { ok: false, error: 'Not authorized' })
})

test('thrown (network) -> not ok, connection message; never treated as success', async () => {
  const orig = console.error; console.error = () => {}
  try {
    assert.deepEqual(await runAction(async () => { throw new TypeError('Failed to fetch') }), { ok: false, error: CONNECTION_ERROR })
  } finally { console.error = orig }
})

test('success, with and without a warning', async () => {
  assert.deepEqual(await runAction(async () => ({ success: true })), { ok: true, value: { success: true }, warning: null })
  const r = await runAction(async () => ({ success: true, warning: 'Clip deleted, but some files couldn\'t be cleaned up.' }))
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.warning, 'Clip deleted, but some files couldn\'t be cleaned up.')
  assert.deepEqual(await runAction(async () => undefined), { ok: true, value: undefined, warning: null })
})

test('a non-string error still counts as a failure', async () => {
  const r = await runAction(async () => ({ error: { code: 'x' } }))
  assert.equal(r.ok, false)
})

test('redirect() signals are re-thrown for Next to handle, not shown as errors', async () => {
  const signal = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/guardian;307;' })
  assert.equal(isNextNavigationSignal(signal), true)
  await assert.rejects(runAction(async () => { throw signal }), (e) => e === signal)
})

test('marksAfterClear: only marks the server deleted leave the screen', () => {
  const marks = [{ id: 'a' }, { id: 'b' }, { id: 'other-users' }, {} /* still saving */]
  const { kept, removed } = marksAfterClear(marks, ['a', 'b'])
  assert.deepEqual(kept, [{ id: 'other-users' }, {}])
  assert.equal(removed, 2)
  assert.deepEqual(marksAfterClear(marks, []).kept, marks)
})
