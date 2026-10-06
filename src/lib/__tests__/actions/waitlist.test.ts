/**
 * joinWaitlist: honest errors, idempotent duplicate, rate limit, column shape.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/waitlist.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { emailFake } from './fakes/email'
import { resetHeaders } from './fakes/next-headers'
import { joinWaitlist } from '../../../app/actions/waitlist'
import { WAITLIST_RATE_LIMITED, WAITLIST_SAVE_FAILED, WAITLIST_BOTH_FAILED, resetWaitlistRateLimitForTests } from '../../../lib/waitlist'

beforeEach(() => {
  resetFake({ tables: { waitlist: [] } })
  emailFake.reset()
  resetHeaders({ 'x-forwarded-for': '203.0.113.10' })
  resetWaitlistRateLimitForTests()
})

test('happy path: inserts email+name only, notifies founder, success', async () => {
  const r = await joinWaitlist({ email: '  Pat@Example.COM ', name: '  Pat  ' })
  assert.deepEqual(r, { success: true })
  assert.equal(state.tables.waitlist.length, 1)
  const row = state.tables.waitlist[0]
  assert.equal(row.email, 'pat@example.com')
  assert.equal(row.name, 'Pat')
  assert.ok(!('role' in row) && !('source' in row), 'only 015 columns')
  assert.deepEqual(emailFake.waitlist, [{ email: 'pat@example.com', name: 'Pat' }])
})

test('duplicate email (23505): success (idempotent), no second row', async () => {
  assert.deepEqual(await joinWaitlist({ email: 'a@b.c', name: 'A' }), { success: true })
  // Second insert hits unique — fake db will return 23505 if we seed + insert again with fail,
  // or natural unique if the fake enforces it. Use fail injection for the second call.
  fail({ table: 'waitlist', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  const r = await joinWaitlist({ email: 'a@b.c', name: 'A' })
  assert.deepEqual(r, { success: true, already: true })
  assert.equal(state.tables.waitlist.length, 1)
})

test('table missing / other DB error + email ok: friendly error, NEVER success', async () => {
  fail({ table: 'waitlist', action: 'insert', error: { code: '42P01', message: 'relation "waitlist" does not exist' } })
  const r = await joinWaitlist({ email: 'new@ex.com', name: 'N' })
  assert.deepEqual(r, { error: WAITLIST_SAVE_FAILED })
  assert.equal(state.tables.waitlist.length, 0)
  assert.equal(emailFake.waitlist.length, 1, 'founder still notified so the signup is not lost')
})

test('DB error AND email fail: both-failed error', async () => {
  fail({ table: 'waitlist', action: 'insert', error: { code: '57014', message: 'timeout' } })
  emailFake.waitlistResult = 'throw'
  const r = await joinWaitlist({ email: 'x@y.z', name: '' })
  assert.deepEqual(r, { error: WAITLIST_BOTH_FAILED })
  assert.equal(state.tables.waitlist.length, 0)
})

test('DB ok + email fail: still success (row is what matters)', async () => {
  emailFake.waitlistResult = 'throw'
  const r = await joinWaitlist({ email: 'ok@ex.com', name: 'Ok' })
  assert.deepEqual(r, { success: true })
  assert.equal(state.tables.waitlist.length, 1)
})

test('invalid email: refused before insert', async () => {
  assert.deepEqual(await joinWaitlist({ email: 'nope', name: 'X' }), { error: 'Please enter a valid email address.' })
  assert.equal(state.tables.waitlist.length, 0)
  assert.equal(emailFake.waitlist.length, 0)
})

test('rate limit after repeated submits from same IP/email', async () => {
  for (let i = 0; i < 5; i++) {
    resetFake({ tables: { waitlist: [] } })
    emailFake.reset()
    const ok = await joinWaitlist({ email: `u${i}@ex.com`, name: 'U' }); assert.equal('success' in ok && ok.success, true)
  }
  const r = await joinWaitlist({ email: 'flood@ex.com', name: 'F' })
  assert.deepEqual(r, { error: WAITLIST_RATE_LIMITED })
})
