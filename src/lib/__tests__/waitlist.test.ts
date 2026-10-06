/**
 * Waitlist join helpers: outcome rules, rate bucket, email normalize.
 * Run with: npx tsx --test src/lib/__tests__/waitlist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WAITLIST_BOTH_FAILED,
  WAITLIST_RATE_MAX,
  WAITLIST_SAVE_FAILED,
  clientIpFromHeaders,
  isValidWaitlistEmail,
  normalizeWaitlistEmail,
  normalizeWaitlistName,
  waitlistJoinOutcome,
  waitlistRateLimited,
} from '../waitlist'

test('normalize + validate email', () => {
  assert.equal(normalizeWaitlistEmail('  Pat@Example.COM '), 'pat@example.com')
  assert.ok(isValidWaitlistEmail('pat@example.com'))
  assert.ok(!isValidWaitlistEmail('not-an-email'))
  assert.ok(!isValidWaitlistEmail(''))
})

test('name trim + length cap; empty -> null', () => {
  assert.equal(normalizeWaitlistName('  Sam  '), 'Sam')
  assert.equal(normalizeWaitlistName('   '), null)
  assert.equal(normalizeWaitlistName('x'.repeat(250))!.length, 200)
})

test('outcome: DB ok -> success even if email failed (soft)', () => {
  assert.deepEqual(waitlistJoinOutcome({ dbError: null, emailOk: false }), { success: true })
  assert.deepEqual(waitlistJoinOutcome({ dbError: null, emailOk: true }), { success: true })
})

test('outcome: unique violation 23505 -> success (idempotent), never an error', () => {
  assert.deepEqual(waitlistJoinOutcome({ dbError: { code: '23505', message: 'duplicate' }, emailOk: false }), { success: true, already: true })
})

test('outcome: other DB error -> error; never success (silent "on the list" bug)', () => {
  assert.deepEqual(waitlistJoinOutcome({ dbError: { code: '42P01', message: 'relation "waitlist" does not exist' }, emailOk: true }), { error: WAITLIST_SAVE_FAILED })
  assert.deepEqual(waitlistJoinOutcome({ dbError: { code: '42P01', message: 'missing' }, emailOk: false }), { error: WAITLIST_BOTH_FAILED })
})

test('rate limit: 5 hits in the window, then blocked', () => {
  const store = new Map<string, number[]>()
  const t0 = 1_000_000
  for (let i = 0; i < WAITLIST_RATE_MAX; i++) {
    assert.equal(waitlistRateLimited('email:a@b.c', t0 + i, store), false, `hit ${i}`)
  }
  assert.equal(waitlistRateLimited('email:a@b.c', t0 + WAITLIST_RATE_MAX, store), true)
  // other key still open
  assert.equal(waitlistRateLimited('ip:1.2.3.4', t0, store), false)
})

test('clientIpFromHeaders: first x-forwarded-for hop', () => {
  assert.equal(clientIpFromHeaders({ get: (n) => (n === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null) }), '1.2.3.4')
  assert.equal(clientIpFromHeaders({ get: (n) => (n === 'x-real-ip' ? '9.9.9.9' : null) }), '9.9.9.9')
  assert.equal(clientIpFromHeaders({ get: () => null }), 'unknown')
})
