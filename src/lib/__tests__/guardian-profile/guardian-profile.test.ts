/**
 * recordConsent never changes an existing profile's role; it only creates a
 * 'guardian' profile when the user has none.
 * Run with: npx tsx --tsconfig src/lib/__tests__/guardian-profile/tsconfig.json --test src/lib/__tests__/guardian-profile/guardian-profile.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, RedirectSignal } from './fake'
import { recordConsent } from '../../../app/actions/guardian'

const USER = { id: 'u1', email: 'parent@example.com' }

function seed(profiles: Record<string, unknown>[]) {
  db.user = USER
  db.tables = {
    guardians: [{ id: 'g1', email: USER.email, full_name: 'Pat Parent', user_id: null }],
    players: [{ id: 'p1', guardian_id: 'g1', consent_given_at: null }],
    profiles,
  }
}

async function consent() {
  await assert.rejects(recordConsent('p1'), (e) => e instanceof RedirectSignal && e.url === '/guardian')
}

beforeEach(() => seed([]))

test('no profile yet: a guardian profile is created', async () => {
  await consent()
  assert.deepEqual(db.tables.profiles, [{ id: USER.id, full_name: 'Pat Parent', role: 'guardian' }])
})

for (const role of ['coach', 'player', 'guardian']) {
  test(`existing ${role} profile: role and name are left unchanged`, async () => {
    seed([{ id: USER.id, full_name: 'Existing Name', role }])
    await consent()
    assert.deepEqual(db.tables.profiles, [{ id: USER.id, full_name: 'Existing Name', role }])
    assert.ok(db.tables.players[0].consent_given_at, 'consent is still recorded')
  })
}

test("other users' profiles are untouched", async () => {
  seed([{ id: 'someone-else', full_name: 'X', role: 'coach' }])
  await consent()
  assert.deepEqual(db.tables.profiles.find(p => p.id === 'someone-else'), { id: 'someone-else', full_name: 'X', role: 'coach' })
})
