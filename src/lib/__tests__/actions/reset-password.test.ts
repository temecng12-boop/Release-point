/**
 * resetPassword server action: the #34 rule on reset, only with a recovery
 * session, success only after updateUser confirms, errors shown.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/reset-password.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authFake } from './fakes/supabase-server'
import { resetPassword } from '../../../app/actions/password-reset'
import { RESET_LINK_INVALID } from '../../../lib/password-reset'

const form = (password: string, confirm = password) => {
  const fd = new FormData(); fd.set('password', password); fd.set('confirm_password', confirm); return fd
}
const RECOVERY = { amr: [{ method: 'recovery', timestamp: 1 }] }

beforeEach(() => { authFake.reset(); authFake.claims = RECOVERY })

test('7 characters is rejected on the server, 8 is accepted', async () => {
  assert.match((await resetPassword(undefined, form('Tq9#vLm')))?.error ?? '', /at least 8 characters/)
  assert.equal(authFake.updates.length, 0)
  assert.deepEqual(await resetPassword(undefined, form('Tq9#vLm2')), { success: true })
  assert.deepEqual(authFake.updates, [{ password: 'Tq9#vLm2' }])
})

test('a common password is refused in any case, even if the browser check was skipped', async () => {
  for (const pw of ['password', 'PassWord', 'BASEBALL', 'Iloveyou']) {
    assert.match((await resetPassword(undefined, form(pw)))?.error ?? '', /too common/, pw)
  }
  assert.equal(authFake.updates.length, 0)
})

test('passwords that do not match are refused', async () => {
  assert.match((await resetPassword(undefined, form('Tq9#vLm2', 'Tq9#vLm3')))?.error ?? '', /don't match/)
  assert.equal(authFake.updates.length, 0)
})

test('no session, an expired session, or a normal (non-reset) session: error with expired flag, no update', async () => {
  authFake.claims = null
  assert.deepEqual(await resetPassword(undefined, form('Tq9#vLm2')), { error: RESET_LINK_INVALID, expired: true })
  authFake.claims = null; authFake.claimsError = { message: 'JWT expired' }
  assert.deepEqual(await resetPassword(undefined, form('Tq9#vLm2')), { error: RESET_LINK_INVALID, expired: true })
  authFake.claimsError = null; authFake.claims = { amr: [{ method: 'password' }] }
  assert.deepEqual(await resetPassword(undefined, form('Tq9#vLm2')), { error: RESET_LINK_INVALID, expired: true })
  assert.equal(authFake.updates.length, 0)
})

test('updateUser errors are shown and never reported as success', async () => {
  authFake.updateError = { message: 'Password is known to be weak', code: 'weak_password' }
  const r = await resetPassword(undefined, form('Tq9#vLm2'))
  assert.equal(r?.success, undefined)
  assert.match(r?.error ?? '', /not changed: Password is known to be weak/)

  authFake.updateError = { message: 'New password should be different', code: 'same_password' }
  assert.match((await resetPassword(undefined, form('Tq9#vLm2')))?.error ?? '', /haven't used/)

  authFake.updateError = null; authFake.updateThrows = true
  const net = await resetPassword(undefined, form('Tq9#vLm2'))
  assert.match(net?.error ?? '', /Couldn't reach the server\. Your password was not changed/)
  assert.equal(net?.success, undefined)
})
