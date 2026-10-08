/**
 * acceptInviteAndRoute (the /auth/complete server action): same invite-only
 * gate as the auth routes, then the shared acceptance work. Strays are
 * removed and sent to the waitlist; an invite whose link didn't stick gets
 * an honest linkFailed (the page offers a retry); everyone else gets their
 * post-accept redirect. No session is an honest error, never a success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/accept-invite-route.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from './fakes/db'
import { fail } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { acceptInviteAndRoute } from '../../../app/actions/auth'

const NOW = new Date().toISOString()
const OLD = new Date(Date.now() - 90 * 86_400_000).toISOString()

const kid = (created_at: string) => ({
  tables: {
    players: [{ id: 'p1', email: 'kid@example.com', user_id: null, coach_id: 'coach-1', full_name: 'Kid' }],
    profiles: [] as Record<string, unknown>[],
    coach_invites: [] as Record<string, unknown>[],
  },
  user: { id: 'u-kid', email: 'kid@example.com', user_metadata: {}, created_at } as never,
})

beforeEach(() => { authAdmin.reset() })

test('invited player: linked and routed to /onboarding (age-screen funnel)', async () => {
  resetFake(kid(NOW))
  const r = await acceptInviteAndRoute('/dashboard')
  assert.deepEqual(r, { redirect: '/onboarding' })
  assert.equal(state.tables.players[0].user_id, 'u-kid')
  assert.deepEqual(authAdmin.deletedUsers, [])
})

test('brand-new stranger: removed and sent to the waitlist', async () => {
  resetFake({
    tables: { players: [], profiles: [{ id: 'u-x', role: 'player', full_name: 'X' }], coach_invites: [] },
    user: { id: 'u-x', email: 'stranger@example.com', user_metadata: {}, created_at: NOW } as never,
  })
  const r = await acceptInviteAndRoute('/dashboard')
  assert.deepEqual(r, { redirect: '/waitlist?reason=invite_only' })
  assert.deepEqual(authAdmin.deletedUsers, ['u-x'])
})

test('existing user without an invite keeps going to next, untouched', async () => {
  resetFake({
    tables: { players: [], profiles: [], coach_invites: [] },
    user: { id: 'u-old', email: 'cadenduke@tracylc.net', user_metadata: {}, created_at: OLD } as never,
  })
  const r = await acceptInviteAndRoute('/dashboard')
  assert.deepEqual(r, { redirect: '/dashboard' })
  assert.deepEqual(authAdmin.deletedUsers, [])
})

test('invite existed but the link failed: honest linkFailed, nothing deleted', async () => {
  resetFake(kid(NOW))
  fail({ table: 'players', action: 'update', error: { message: 'timeout' } })
  const errors: unknown[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  let r: Awaited<ReturnType<typeof acceptInviteAndRoute>>
  try {
    r = await acceptInviteAndRoute('/dashboard')
  } finally {
    console.error = orig
  }
  assert.deepEqual(r, { linkFailed: true, next: '/dashboard' })
  assert.deepEqual(authAdmin.deletedUsers, [], 'an invitee is never deleted for a link failure')
  assert.ok(errors.some((a) => JSON.stringify(a).includes('player link failed')))
})

test('no session: honest error, never a redirect', async () => {
  resetFake({ tables: { players: [], profiles: [], coach_invites: [] }, user: null })
  const r = await acceptInviteAndRoute('/dashboard')
  assert.ok('error' in r)
  assert.doesNotMatch((r as { error: string }).error, /dashboard|success/i)
})
