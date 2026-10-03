/**
 * Migration 029 (promote_empty_player_to_guardian) against Postgres, in PGlite
 * (in-memory; never a real database). Applies every migration before 029, then
 * 029 twice, and checks which profiles may become 'guardian'.
 * Run with: npx tsx --test supabase/tests/guardian-role-029.test.ts
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, runFile, MIGRATIONS } from './pglite-schema'

const MIGRATION = join(MIGRATIONS, '029_guardian_role_from_empty_player.sql')
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const COACH = u(900)
let db: PGlite
let n = 0
let kid: string, kidClip: string

const q = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params)

async function user(role: string | null) {
  const id = u(++n)
  await q(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `u${n}@x.test`]) // signup trigger: 'player'
  if (role === null) await q(`DELETE FROM profiles WHERE id = $1`, [id])
  else await q(`UPDATE profiles SET role = $2 WHERE id = $1`, [id, role])
  await q(`INSERT INTO guardians (user_id, email) VALUES ($1, $2)`, [id, `u${n}@x.test`])
  return id
}

async function promote(id: string, as = 'service_role') {
  await db.exec(`SET ROLE ${as}`)
  try { return { value: (await q(`SELECT public.promote_empty_player_to_guardian($1) AS v`, [id])).rows[0].v } }
  catch (e) { return { error: e as Error } }
  finally { await db.exec('RESET ROLE') }
}
const role = async (id: string) => (await q(`SELECT role FROM profiles WHERE id = $1`, [id])).rows[0]?.role

async function expectResult(id: string, promoted: boolean, wantRole: string) {
  const r = await promote(id)
  assert.equal(r.error, undefined)
  assert.equal(r.value, promoted)
  assert.equal(await role(id), wantRole)
}

before(async () => {
  const built = await migratedDb('029')
  db = built.db
  assert.deepEqual(built.unexpected, [], 'migrations before 029 apply')
  // Stand-ins for tables from other branches' migrations (025 lessons,
  // 028 feedback_reports), which 029 checks only if they exist.
  await q(`CREATE TABLE IF NOT EXISTS public.lessons (id uuid primary key default gen_random_uuid(), coach_id uuid REFERENCES auth.users(id))`)
  await q(`CREATE TABLE IF NOT EXISTS public.feedback_reports (id uuid primary key default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id))`)
  await runFile(db, MIGRATION)
  await runFile(db, MIGRATION) // safe to re-run
  await q(`INSERT INTO auth.users (id, email) VALUES ($1, 'coach@x.test')`, [COACH])
  await q(`UPDATE profiles SET role = 'coach' WHERE id = $1`, [COACH])
  kid = (await q(`INSERT INTO players (coach_id, full_name) VALUES ($1, 'Kid') RETURNING id`, [COACH])).rows[0].id as string
  kidClip = (await q(`INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1, $2, 'p/1', 't') RETURNING id`, [kid, COACH])).rows[0].id as string
})
after(async () => { await db?.close() })

test('only service_role can execute it', async () => {
  const r = (await q(`SELECT has_function_privilege('service_role', 'public.promote_empty_player_to_guardian(uuid)', 'EXECUTE') s,
    has_function_privilege('authenticated', 'public.promote_empty_player_to_guardian(uuid)', 'EXECUTE') a,
    has_function_privilege('anon', 'public.promote_empty_player_to_guardian(uuid)', 'EXECUTE') n`)).rows[0]
  assert.deepEqual(r, { s: true, a: false, n: false })
  const id = await user('player')
  for (const as of ['authenticated', 'anon']) {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [id])
    assert.match((await promote(id, as)).error?.message ?? '', /permission denied/)
  }
  assert.equal(await role(id), 'player')
})

test('search_path is pinned to public, pg_temp', async () => {
  const r = (await q(`SELECT proconfig FROM pg_proc WHERE proname = 'promote_empty_player_to_guardian'`)).rows
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].proconfig, ['search_path=public, pg_temp'])
})

test('empty player becomes guardian; a second call changes nothing', async () => {
  const id = await user('player')
  await expectResult(id, true, 'guardian')
  await expectResult(id, false, 'guardian')
})

test('coach stays coach, guardian stays guardian', async () => {
  await expectResult(await user('coach'), false, 'coach')
  await expectResult(await user('guardian'), false, 'guardian')
})

test('no profile: nothing is created (recordConsent inserts it)', async () => {
  const id = await user(null)
  await expectResult(id, false, undefined as unknown as string)
})

test('player not linked to a guardians row stays player', async () => {
  const id = u(++n)
  await q(`INSERT INTO auth.users (id, email) VALUES ($1, 'x@x.test')`, [id])
  await expectResult(id, false, 'player')
})

const withData: [string, (id: string) => Promise<unknown>][] = [
  ['a players row', id => q(`INSERT INTO players (coach_id, user_id, full_name) VALUES ($1, $2, 'Me')`, [COACH, id])],
  ['clips', id => q(`INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1, $2, 'p/' || gen_random_uuid(), 't')`, [kid, id])],
  ['annotations', id => q(`INSERT INTO annotations (clip_id, created_by, type, origin_time) VALUES ($1, $2, 'line', 1)`, [kidClip, id])],
  ['timestamp_notes', id => q(`INSERT INTO timestamp_notes (clip_id, created_by, time_seconds, body) VALUES ($1, $2, 1, 'n')`, [kidClip, id])],
  ['pitch_metrics', id => q(`INSERT INTO pitch_metrics (clip_id, created_by) VALUES ($1, $2)`, [kidClip, id])],
  ['pitch_analysis', id => q(`INSERT INTO pitch_analysis (clip_id, player_id, coach_id) VALUES ($1, $2, $3)`, [kidClip, kid, id])],
  ['bullpen_sessions', id => q(`INSERT INTO bullpen_sessions (player_id, coach_id) VALUES ($1, $2)`, [kid, id])],
  ['teams', id => q(`INSERT INTO teams (coach_id, name) VALUES ($1, 'T')`, [id])],
  ['team_coaches', async id => {
    const team = (await q(`INSERT INTO teams (coach_id, name) VALUES ($1, 'T') RETURNING id`, [COACH])).rows[0].id
    return q(`INSERT INTO team_coaches (team_id, coach_id) VALUES ($1, $2)`, [team, id])
  }],
  ['players.coach_id', id => q(`INSERT INTO players (coach_id, full_name) VALUES ($1, 'K2')`, [id])],
  ['guardians.created_by', id => q(`INSERT INTO guardians (email, created_by) VALUES ('g@x.test', $1)`, [id])],
  ['storage.objects.owner', id => q(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('lessons', 'a/b', $1)`, [id])],
  ['storage.objects.owner_id', id => q(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('lessons', 'a/c', $1)`, [id])],
  ['lessons', id => q(`INSERT INTO lessons (coach_id) VALUES ($1)`, [id])],
  ['feedback_reports', id => q(`INSERT INTO feedback_reports (user_id) VALUES ($1)`, [id])],
  ['a filled-in profile field', id => q(`UPDATE profiles SET avatar_url = 'a.png' WHERE id = $1`, [id])],
]
for (const [label, seed] of withData) {
  test(`player with ${label} stays player`, async () => {
    const id = await user('player')
    await seed(id)
    await expectResult(id, false, 'player')
  })
}
