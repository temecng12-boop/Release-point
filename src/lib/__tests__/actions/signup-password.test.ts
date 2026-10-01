/**
 * signUp checks the password rule on the server, so a request that skips the
 * browser check (a direct POST) is still refused before Supabase is called.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/signup-password.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake } from './fakes/db'
import { signUpCalls } from './fakes/supabase-server'
import { signUp } from '../../../app/actions/auth'

const form = (password: string) => {
  const fd = new FormData()
  fd.set('tos', 'on'); fd.set('email', 'coach@example.com'); fd.set('full_name', 'Coach C'); fd.set('password', password)
  return fd
}

beforeEach(() => { resetFake({ tables: { profiles: [] } }); signUpCalls.length = 0 })

test('server rejects a 7-character password without calling Supabase', async () => {
  const r = await signUp(undefined, form('Tq9#vLm'))
  assert.match(r?.error ?? '', /at least 8 characters/)
  assert.equal(signUpCalls.length, 0)
})

test('server rejects a common password in any case without calling Supabase', async () => {
  for (const pw of ['password', 'PassWord', 'BASEBALL']) {
    const r = await signUp(undefined, form(pw))
    assert.match(r?.error ?? '', /too common/, pw)
  }
  assert.equal(signUpCalls.length, 0)
})

test('server rejects a missing password field', async () => {
  const fd = form('x'); fd.delete('password')
  assert.match((await signUp(undefined, fd))?.error ?? '', /at least 8/)
  assert.equal(signUpCalls.length, 0)
})

test('an 8-character uncommon password reaches Supabase signUp', async () => {
  await assert.rejects(signUp(undefined, form('Tq9#vLm2')), (e: Error) => e.message === 'NEXT_REDIRECT')
  assert.deepEqual(signUpCalls, [{ email: 'coach@example.com', password: 'Tq9#vLm2' }])
})
