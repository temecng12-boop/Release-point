/**
 * finishInviteAcceptance (shared by /auth/callback and /auth/confirm):
 * links the invited players row by id (case-insensitive match), notifies the
 * coach, consumes a pending coach invite, and never throws: failures are
 * logged and the next sign-in retries. postAcceptRedirect sends newly linked
 * players to /onboarding (the age-screen funnel) and keeps recovery links.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/invite-accept.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { finishInviteAcceptance, postAcceptRedirect } from '../../invite-accept'

beforeEach(() => { resetFake({ tables: { players: [], profiles: [], coach_invites: [], terms_acceptances: [] } }) })

const tables = () => ({
  players: [{ id: 'p1', email: '  Kid@Example.com ', user_id: null, coach_id: 'coach-1', full_name: 'Kid' }],
  profiles: [{ id: 'coach-1', role: 'coach', full_name: 'Coach C' }],
  coach_invites: [] as Record<string, unknown>[],
  terms_acceptances: [] as Record<string, unknown>[],
})

test('links the invite across case/whitespace differences and reports it', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  resetFake({ tables: tables(), user: { id: 'u-kid', email: 'kid@example.com' } })
  const { linkedPlayers } = await finishInviteAcceptance(supabaseAdmin, { id: 'u-kid', email: 'kid@example.com' })
  assert.equal(linkedPlayers.length, 1)
  assert.equal(linkedPlayers[0].id, 'p1')
  assert.equal(state.tables.players[0].user_id, 'u-kid')
  assert.ok(state.tables.players[0].accepted_at)
})

test('a linked row is never re-linked; a stranger links nothing', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  resetFake({ tables: tables(), user: { id: 'u-kid', email: 'kid@example.com' } })
  state.tables.players[0].user_id = 'u-old'
  assert.deepEqual((await finishInviteAcceptance(supabaseAdmin, { id: 'u-kid', email: 'kid@example.com' })).linkedPlayers, [])
  assert.deepEqual((await finishInviteAcceptance(supabaseAdmin, { id: 'u-x', email: 'stranger@example.com' })).linkedPlayers, [])
})

test('a link failure is logged, not thrown, and the coach invite still runs', async () => {
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  resetFake({
    tables: {
      ...tables(),
      players: [{ id: 'p1', email: 'coach2@example.com', user_id: null, coach_id: 'coach-1', full_name: 'C2' }],
      coach_invites: [{ id: 'i1', email: 'coach2@example.com', invited_by: 'admin', token: 't', created_at: '2026-10-05T00:00:00Z', accepted_at: null }],
      profiles: [...tables().profiles, { id: 'u-c2', role: 'player', full_name: 'C2' }],
    },
    user: { id: 'u-c2', email: 'coach2@example.com' },
  })
  fail({ table: 'players', action: 'update', error: { message: 'timeout' } })
  const errors: unknown[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  let linked: unknown
  try {
    linked = (await finishInviteAcceptance(supabaseAdmin, { id: 'u-c2', email: 'coach2@example.com' })).linkedPlayers
  } finally {
    console.error = orig
  }
  assert.deepEqual(linked, [], 'no link, but no throw either')
  assert.ok(errors.some((a) => JSON.stringify(a).includes('player link failed')), 'the failure is logged')
  assert.equal(
    (state.tables.profiles.find((p) => p.id === 'u-c2') as { role: string }).role,
    'coach',
    'the pending coach invite is still consumed',
  )
})

test('postAcceptRedirect: newly linked players start at /onboarding; recovery stays', () => {
  assert.equal(postAcceptRedirect('/dashboard', 1), '/onboarding')
  assert.equal(postAcceptRedirect('/dashboard', 0), '/dashboard')
  assert.equal(postAcceptRedirect('/auth/reset', 3), '/auth/reset', 'a recovery session is never diverted')
})
