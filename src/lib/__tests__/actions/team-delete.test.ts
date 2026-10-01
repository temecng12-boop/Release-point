/**
 * deleteTeam: one delete_team RPC (migration 031) with the user's own client;
 * an RPC error or deleted = false comes back as an error and nothing is
 * revalidated, so the UI keeps the team on screen.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/team-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state, fakeClient, type DbError } from './fakes/db'
import { deleteTeam } from '../../../app/actions/team'

const T = '44444444-4444-4444-8444-444444444444'
const COACH = { id: 'coach', email: 'coach@example.com' }

let calls: { fn: string; args: unknown }[] = []
let reply: { data: unknown; error: DbError | null } = { data: null, error: null }
;(fakeClient as Record<string, unknown>).rpc = async (fn: string, args: unknown) => {
  calls.push({ fn, args })
  return reply
}

function seed(user: typeof state.user = COACH) {
  resetFake({ user })
  calls = []
}

test('deleteTeam: deleted -> success, one RPC, dashboard revalidated', async () => {
  seed()
  reply = { data: [{ deleted: true, team_name: 'Varsity' }], error: null }
  assert.deepEqual(await deleteTeam(T), { success: true })
  assert.deepEqual(calls, [{ fn: 'delete_team', args: { p_team_id: T } }])
  assert.ok(state.revalidated.includes('/dashboard'))
  assert.deepEqual(state.ops, [], 'no direct table writes')
})

test('deleteTeam: not allowed or already gone (deleted = false) -> error', async () => {
  seed()
  reply = { data: [{ deleted: false, team_name: null }], error: null }
  const r = await deleteTeam(T)
  assert.match(String(r.error), /not deleted/)
  assert.equal(r.success, undefined)
  assert.deepEqual(state.revalidated, [])
})

test('deleteTeam: empty RPC result -> error', async () => {
  seed()
  reply = { data: [], error: null }
  assert.ok((await deleteTeam(T)).error)
})

test('deleteTeam: RPC error -> error, nothing revalidated', async () => {
  seed()
  reply = { data: null, error: { code: '23503', message: 'fk violation' } }
  const r = await deleteTeam(T)
  assert.match(String(r.error), /Could not delete the team\. Nothing was changed/)
  assert.deepEqual(state.revalidated, [])
})

test('deleteTeam: migration 031 not applied -> clear error', async () => {
  seed()
  reply = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.delete_team' } }
  assert.match(String((await deleteTeam(T)).error), /database update pending/)
})

test('deleteTeam: signed out or bad id -> error without calling the database', async () => {
  seed(null)
  assert.deepEqual(await deleteTeam(T), { error: 'Not authenticated' })
  seed()
  assert.ok((await deleteTeam('not-a-uuid')).error)
  assert.deepEqual(calls, [])
})
