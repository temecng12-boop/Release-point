/**
 * recordConsent: every write checked, an error goes back to the form (no
 * redirect), consent is written last, and a retry after a failure works.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/guardian-consent.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { RedirectSignal } from './fakes/next-navigation'
import { recordConsent } from '../../../app/actions/guardian'

const USER = { id: 'u-guardian', email: 'parent@example.com' }
const tables = () => ({
  guardians: [{ id: 'g1', email: USER.email, full_name: 'Pat Parent', user_id: null }],
  players: [{ id: 'p1', guardian_id: 'g1', consent_given_at: null }, { id: 'p2', guardian_id: 'g-other', consent_given_at: null }],
  profiles: [] as Record<string, unknown>[],
})

async function run(playerId = 'p1') {
  try { return { returned: await recordConsent(playerId) } }
  catch (e) { if (e instanceof RedirectSignal) return { redirect: e.url }; throw e }
}
const consent = (id = 'p1') => state.tables.players.find(p => p.id === id)?.consent_given_at ?? null

beforeEach(() => { resetFake({ tables: tables(), user: USER }) })

test('all writes succeed: consent, guardian link and profile are saved, then redirect to /guardian', async () => {
  assert.deepEqual(await run(), { redirect: '/guardian' })
  assert.ok(consent())
  assert.equal(state.tables.guardians[0].user_id, USER.id)
  assert.deepEqual(state.tables.profiles, [{ id: USER.id, full_name: 'Pat Parent', role: 'guardian' }])
})

for (const [table, action] of [['guardians', 'update'], ['profiles', 'upsert'], ['promote_empty_player_to_guardian', 'rpc'], ['players', 'update']] as const) {
  test(`${table} ${action} fails: returns an error to the form, no redirect, no consent recorded`, async () => {
    fail({ table, action, error: { code: '42501', message: 'permission denied' } })
    const r = await run()
    assert.equal(r.redirect, undefined)
    assert.match(r.returned?.error ?? '', /couldn't record your consent/)
    assert.equal(consent(), null)
  })
}

test('consent is the last write, so an earlier failure never leaves consent on file', async () => {
  await run()
  const writes = state.ops.filter(o => o.action !== 'select').map(o => `${o.table}.${o.action}`)
  assert.deepEqual(writes, ['guardians.update', 'profiles.upsert', 'promote_empty_player_to_guardian.rpc', 'players.update'])
})

test('retry after a failure completes the consent', async () => {
  fail({ table: 'profiles', action: 'upsert', error: { message: 'timeout' }, times: 1 })
  assert.ok((await run()).returned?.error)
  assert.deepEqual(await run(), { redirect: '/guardian' })
  assert.ok(consent())
  assert.equal(state.tables.profiles.length, 1)
})

test('player not linked to this guardian: error, not a redirect that looks like success', async () => {
  const r = await run('p2')
  assert.match(r.returned?.error ?? '', /couldn't record consent for this player/)
  assert.equal(consent('p2'), null)
})

test('guardian lookup error (not "no row") returns an error instead of redirecting', async () => {
  fail({ table: 'guardians', action: 'select', error: { code: '57014', message: 'statement timeout' } })
  assert.ok((await run()).returned?.error)
})

test('no guardian row for this email still goes to login, as before', async () => {
  resetFake({ tables: { ...tables(), guardians: [] }, user: USER })
  assert.deepEqual(await run(), { redirect: '/auth/login' })
})
