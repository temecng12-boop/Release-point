/**
 * recordConsent and the profile role: an existing role is never overwritten,
 * except that an unused 'player' profile (no players row, clips or other data)
 * becomes 'guardian'. Consent is recorded in every case, and a failed write
 * is an error, never a redirect.
 * The rule itself runs in Postgres (migration 029, checked in PGlite); the fake
 * rpc mirrors it.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/guardian-role.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state, rpcs, type Row } from './fakes/db'
import { RedirectSignal } from './fakes/next-navigation'
import { recordConsent } from '../../../app/actions/guardian'

const USER = { id: 'u1', email: 'parent@example.com' }

function seed(profile: Row | null, extra: Record<string, Row[]> = {}) {
  resetFake({
    user: USER,
    tables: {
      guardians: [{ id: 'g1', email: USER.email, full_name: 'Pat Parent', user_id: null }],
      players: [{ id: 'p1', guardian_id: 'g1', coach_id: 'coach-1', user_id: null, consent_given_at: null }],
      profiles: [{ id: 'someone-else', full_name: 'X', role: 'coach' }, ...(profile ? [{ id: USER.id, ...profile }] : [])],
      ...extra,
    },
  })
}

async function run() {
  try { return { returned: await recordConsent('p1') } }
  catch (e) { if (e instanceof RedirectSignal) return { redirect: e.url }; throw e }
}
const profile = () => state.tables.profiles.find(p => p.id === USER.id)
const consented = () => state.tables.players.find(p => p.id === 'p1')?.consent_given_at ?? null

async function expectRole(role: string, fullName = 'Existing Name') {
  assert.deepEqual(await run(), { redirect: '/guardian' })
  assert.ok(consented(), 'consent is recorded')
  assert.equal(state.tables.guardians[0].user_id, USER.id)
  assert.equal(profile()?.role, role)
  assert.equal(profile()?.full_name, fullName, 'name is never overwritten')
  assert.deepEqual(state.tables.profiles.find(p => p.id === 'someone-else'), { id: 'someone-else', full_name: 'X', role: 'coach' })
}

beforeEach(() => seed(null))

test('player with a players row stays player', async () => {
  seed({ full_name: 'Existing Name', role: 'player' }, {
    players: [
      { id: 'p1', guardian_id: 'g1', coach_id: 'coach-1', user_id: null, consent_given_at: null },
      { id: 'p-self', guardian_id: null, coach_id: 'coach-1', user_id: USER.id, consent_given_at: null },
    ],
  })
  await expectRole('player')
})

test('player with clips stays player', async () => {
  seed({ full_name: 'Existing Name', role: 'player' }, { clips: [{ id: 'c1', player_id: 'p1', uploaded_by: USER.id }] })
  await expectRole('player')
})

for (const [table, row] of [
  ['timestamp_notes', { id: 'n1', clip_id: 'c0', created_by: USER.id }],
  ['annotations', { id: 'a1', clip_id: 'c0', created_by: USER.id }],
  ['lessons', { id: 'l1', clip_id: 'c0', coach_id: USER.id }],
  ['bullpen_sessions', { id: 'b1', player_id: 'p1', coach_id: USER.id }],
  ['feedback_reports', { id: 'f1', user_id: USER.id }],
  ['team_coaches', { team_id: 't1', coach_id: USER.id }],
] as const) {
  test(`player with other data (${table}) stays player`, async () => {
    seed({ full_name: 'Existing Name', role: 'player' }, { [table]: [{ ...row }] })
    await expectRole('player')
  })
}

test('player with a filled-in profile field stays player', async () => {
  seed({ full_name: 'Existing Name', role: 'player', avatar_url: 'me.png' })
  await expectRole('player')
})

test('coach stays coach', async () => {
  seed({ full_name: 'Existing Name', role: 'coach' })
  await expectRole('coach')
})

test('existing guardian stays guardian', async () => {
  seed({ full_name: 'Existing Name', role: 'guardian' })
  await expectRole('guardian')
})

test('empty player becomes guardian (name kept)', async () => {
  seed({ full_name: 'Existing Name', role: 'player' })
  await expectRole('guardian')
})

test('no profile at all: a guardian profile is created', async () => {
  await expectRole('guardian', 'Pat Parent')
  assert.deepEqual(profile(), { id: USER.id, full_name: 'Pat Parent', role: 'guardian' })
})

test('the role check runs in the database through the service client, after the link and before consent', async () => {
  seed({ full_name: 'Existing Name', role: 'player' })
  await run()
  const writes = state.ops.filter(o => o.action !== 'select').map(o => `${o.table}.${o.action}`)
  assert.deepEqual(writes, ['guardians.update', 'profiles.upsert', 'promote_empty_player_to_guardian.rpc', 'players.update'])
  const upsert = state.ops.find(o => o.table === 'profiles' && o.action === 'upsert')
  assert.deepEqual(state.ops.find(o => o.action === 'rpc')?.values, { p_user_id: USER.id })
  assert.ok(upsert, 'profile insert attempted')
  assert.equal(state.ops.some(o => o.table === 'profiles' && o.action === 'update'), false, 'no direct role update from the action')
})

test('role check fails: error to the form, no consent, role unchanged; a retry completes', async () => {
  seed({ full_name: 'Existing Name', role: 'player' })
  fail({ table: 'promote_empty_player_to_guardian', action: 'rpc', error: { code: '57014', message: 'statement timeout' }, times: 1 })
  const r = await run()
  assert.equal(r.redirect, undefined)
  assert.match(r.returned?.error ?? '', /couldn't record your consent/)
  assert.equal(consented(), null)
  assert.equal(profile()?.role, 'player')
  await expectRole('guardian')
})

test('migration 029 not applied (function missing): error, not a fake success', async () => {
  seed({ full_name: 'Existing Name', role: 'player' })
  const saved = rpcs.promote_empty_player_to_guardian
  delete rpcs.promote_empty_player_to_guardian
  try {
    const r = await run()
    assert.equal(r.redirect, undefined)
    assert.ok(r.returned?.error)
    assert.equal(consented(), null)
  } finally { rpcs.promote_empty_player_to_guardian = saved }
})

test('profile insert fails for a user with no profile: error, no consent', async () => {
  fail({ table: 'profiles', action: 'upsert', error: { code: '42501', message: 'permission denied' } })
  const r = await run()
  assert.ok(r.returned?.error)
  assert.equal(consented(), null)
  assert.equal(profile(), undefined)
})

test('consent write fails after the role change: error to the form; a retry records consent', async () => {
  seed({ full_name: 'Existing Name', role: 'player' })
  fail({ table: 'players', action: 'update', error: { message: 'timeout' }, times: 1 })
  assert.ok((await run()).returned?.error)
  assert.equal(consented(), null)
  await expectRole('guardian')
})
