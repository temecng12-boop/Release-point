/**
 * Migration 042 (invite-only signup hook) in PGlite (in-memory; never a real
 * database): the Before User Created hook allows only invited emails
 * (unlinked players row or pending coach_invites row, matched on
 * lower(trim(email))), rejects everything else with a 403 error object, and
 * handle_new_user always writes role 'player'. Invite emails are normalized
 * on write (mixed case, whitespace).
 * Run with: npx tsx --test supabase/tests/invite-only-042.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, tryFile, u, migration } from './prod-shape/prod-fixture'

const NEXT = [
  '037_age_bands.sql',
  '038_grandfather_existing_players.sql',
  '039_terms_history_tos_lock_grade_ranges.sql',
  '040_profile_freeze_marker.sql',
  '041_coach_invites.sql',
  '042_invite_only_signup_hook.sql',
]

async function db042(): Promise<PGlite> {
  const { db, unexpected } = await freshDb('037')
  assert.deepEqual(unexpected, [])
  for (const m of NEXT) {
    assert.equal(await tryFile(db, migration(m)), '', m)
    assert.equal(await tryFile(db, migration(m)), '', `${m} runs twice`)
  }
  return db
}

const hook = (db: PGlite, email: string | null) =>
  db.query<{ r: unknown }>(
    `SELECT public.before_user_created_invite_check($1) r`,
    [email === null ? { user: {} } : { user: { email } }],
  ).then((r) => r.rows[0].r as Record<string, { http_code?: number; message?: string }>)

const COACH = u(1), KID = u(3)

async function seedInvites(db: PGlite) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'coach@x.test','{"role":"coach"}')`, [COACH])
  // Roster email with non-normalized case (the hook still matches it).
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid','Kid@X.Test')`, [u(101), COACH])
  await db.query(`INSERT INTO coach_invites (email, invited_by) VALUES ('NewCoach@X.Test',$1)`, [COACH])
}

test('042 applies cleanly (also twice) on a fresh database', async () => {
  await db042()
})

test('hook: unknown, empty, and missing emails are rejected with a 403 error object', async () => {
  const db = await db042()
  await seedInvites(db)
  for (const email of ['stranger@x.test', '', '   ']) {
    const r = await hook(db, email)
    assert.equal(r.error?.http_code, 403, email || '(empty)')
    assert.match(r.error?.message ?? '', /invite-only/i)
  }
  assert.equal((await hook(db, null)).error?.http_code, 403, 'missing email')
})

test('hook: unlinked players email passes (any case, whitespace); linked does not', async () => {
  const db = await db042()
  await seedInvites(db)
  for (const email of ['kid@x.test', 'KID@X.TEST', '  Kid@X.Test  ']) {
    assert.deepEqual(await hook(db, email), {}, email)
  }
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'kid@x.test','{}')`, [KID])
  await db.query(`UPDATE players SET user_id=$1 WHERE id=$2`, [KID, u(101)])
  assert.equal((await hook(db, 'kid@x.test')).error?.http_code, 403, 'already linked: no longer an invite')
})

test('hook: pending coach invite passes (any case); accepted does not; strangers do not', async () => {
  const db = await db042()
  await seedInvites(db)
  assert.deepEqual(await hook(db, 'newcoach@x.test'), {})
  assert.deepEqual(await hook(db, '  NEWCOACH@X.test '), {}, 'case + whitespace')
  await db.query(`UPDATE coach_invites SET accepted_at=now() WHERE email='newcoach@x.test'`)
  assert.equal((await hook(db, 'newcoach@x.test')).error?.http_code, 403, 'accepted: no longer pending')
})

test('handle_new_user: role coach/guardian in signup metadata still comes out as player', async () => {
  const db = await db042()
  await seedInvites(db)
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ($1,'sneaky@x.test','{"role":"coach","full_name":"Sneaky"}'),
      ($2,'sneaky2@x.test','{"role":"guardian"}'),
      ($3,'plain@x.test','{}')`,
    [u(11), u(12), u(13)],
  )
  const roles = (await db.query<{ id: string; role: string; full_name: string }>(
    `SELECT id, role, full_name FROM profiles WHERE id = ANY($1) ORDER BY id`, [[u(11), u(12), u(13)]])).rows
  assert.deepEqual(roles.map((r) => r.role), ['player', 'player', 'player'])
  assert.equal(roles[0].full_name, 'Sneaky', 'the name still passes through')
})

test('invite emails are normalized on write (players + coach_invites)', async () => {
  const db = await db042()
  await seedInvites(db)
  const player = (await db.query<{ email: string }>(`SELECT email FROM players WHERE id=$1`, [u(101)])).rows[0]
  assert.equal(player.email, 'kid@x.test')
  const invite = (await db.query<{ email: string }>(`SELECT email FROM coach_invites WHERE invited_by=$1`, [COACH])).rows[0]
  assert.equal(invite.email, 'newcoach@x.test')
})

test('hook grants: anon/authenticated/public cannot execute; function exists', async () => {
  const db = await db042()
  const r = (await db.query<{ anon: boolean; authd: boolean; pub: boolean; exists: boolean }>(`
    SELECT
      has_function_privilege('anon', 'public.before_user_created_invite_check(jsonb)', 'execute') AS anon,
      has_function_privilege('authenticated', 'public.before_user_created_invite_check(jsonb)', 'execute') AS authd,
      has_function_privilege('public', 'public.before_user_created_invite_check(jsonb)', 'execute') AS pub,
      EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'before_user_created_invite_check') AS exists`)).rows[0]
  assert.equal(r.exists, true)
  assert.equal(r.anon, false)
  assert.equal(r.authd, false)
  assert.equal(r.pub, false)
})
