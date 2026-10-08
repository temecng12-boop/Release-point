/**
 * Old app (current main) write shapes against a post-044 schema.
 *
 * 044 is pasted before this branch deploys. Until then, main still writes:
 *   invite:     INSERT players (coach_id, full_name, email)
 *   self-link:  INSERT players (user_id, full_name, email, accepted_at)
 *   position:   UPDATE players SET position = 'pitcher'|'hitter'
 *   clip:       INSERT clips (player_id, storage_path, title, session_date, uploaded_by)
 *   reads:      explicit old columns, never select('*')
 *
 * After 044 those must still succeed: positions defaults to '{}', clip_kind
 * stays null, and the old position CHECK (pitcher|hitter) still holds.
 * Run with: npx tsx --test supabase/tests/main-writes-after-044.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, as, tryFile, u, migration } from './prod-shape/prod-fixture'

const NEXT = [
  '037_age_bands.sql',
  '038_grandfather_existing_players.sql',
  '039_terms_history_tos_lock_grade_ranges.sql',
  '040_profile_freeze_marker.sql',
  '041_coach_invites.sql',
  '042_invite_only_signup_hook.sql',
  '043_under_13_launch_policy.sql',
]
const M044 = migration('044_player_positions_clip_kind.sql')
const SRC = join(__dirname, '..', '..', 'src')

async function dbAfter044(): Promise<PGlite> {
  const { db, unexpected } = await freshDb('037')
  assert.deepEqual(unexpected, [])
  for (const m of NEXT) assert.equal(await tryFile(db, migration(m)), '', m)
  assert.equal(await tryFile(db, M044), '')
  return db
}

const COACH = u(1)
const KID = u(3)

async function people(db: PGlite) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ($1,'c@x','{"role":"coach"}'),($2,'k@x','{}')
     ON CONFLICT DO NOTHING`,
    [COACH, KID],
  )
}

test('main invite insert (coach_id, full_name, email) works after 044; positions defaults to {}', async () => {
  const db = await dbAfter044()
  await people(db)
  const r = await as(
    db,
    'service',
    `INSERT INTO players (coach_id, full_name, email) VALUES ($1,'Sam New','sam@x') RETURNING id, position, positions`,
    [COACH],
  )
  assert.equal(r.err, '', r.err)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].position, null)
  assert.deepEqual(r.rows[0].positions, [])
})

test('main self-signup insert (user_id, full_name, email, accepted_at) works after 044', async () => {
  const db = await dbAfter044()
  await people(db)
  const r = await as(
    db,
    'service',
    `INSERT INTO players (user_id, full_name, email, accepted_at) VALUES ($1,'Kid','kid@x', now()) RETURNING position, positions`,
    [KID],
  )
  assert.equal(r.err, '', r.err)
  assert.equal(r.rows[0].position, null)
  assert.deepEqual(r.rows[0].positions, [])
})

test('main position writes (pitcher|hitter) still satisfy the old CHECK; catcher does not', async () => {
  const db = await dbAfter044()
  await people(db)
  const ins = await as(
    db,
    'service',
    `INSERT INTO players (id, coach_id, user_id, full_name, email) VALUES ($1,$2,$3,'Kid','kid@x') RETURNING id`,
    [u(401), COACH, KID],
  )
  assert.equal(ins.err, '')
  for (const pos of ['pitcher', 'hitter'] as const) {
    const r = await as(db, 'service', `UPDATE players SET position = $2 WHERE id=$1 RETURNING position, positions`, [u(401), pos])
    assert.equal(r.err, '', pos)
    assert.equal(r.rows[0].position, pos)
    // Main does not write positions; the 044 default stays until this branch deploys.
    assert.deepEqual(r.rows[0].positions, [])
  }
  const catcher = await as(db, 'service', `UPDATE players SET position = 'catcher' WHERE id=$1`, [u(401)])
  assert.match(catcher.err, /check constraint|players_position|invalid input/i)
  const leftover = await as(db, 'service', `UPDATE players SET position = 'shortstop' WHERE id=$1`, [u(401)])
  assert.match(leftover.err, /check constraint|players_position|invalid input/i)
  const kept = (await db.query<{ position: string }>(`SELECT position FROM players WHERE id=$1`, [u(401)])).rows[0]
  assert.equal(kept.position, 'hitter')
})

test('main clip insert (no clip_kind) works after 044; clip_kind stays null; old-column SELECTs work', async () => {
  const db = await dbAfter044()
  await people(db)
  await db.query(
    `INSERT INTO players (id, coach_id, user_id, full_name, email, position) VALUES ($1,$2,$3,'Kid','kid@x','pitcher')`,
    [u(501), COACH, KID],
  )
  await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(501)])
  const clip = await as(
    db,
    'service',
    `INSERT INTO clips (player_id, storage_path, title, session_date, uploaded_by)
     VALUES ($1,$2,'Bullpen',$3,$4)
     RETURNING id, clip_kind, title, session_date`,
    [u(501), `${u(501)}/1.mp4`, '2026-10-01', COACH],
  )
  assert.equal(clip.err, '', clip.err)
  assert.equal(clip.rows[0].clip_kind, null)
  assert.equal(clip.rows[0].title, 'Bullpen')

  const clipRead = await as(
    db,
    'service',
    `SELECT id, title, storage_path, created_at, session_date, player_id, notes, voice_path FROM clips WHERE id=$1`,
    [clip.rows[0].id],
  )
  assert.equal(clipRead.err, '')
  assert.equal(clipRead.rows.length, 1)

  const playerRead = await as(
    db,
    'service',
    `SELECT id, full_name, age_group, position FROM players WHERE id=$1`,
    [u(501)],
  )
  assert.equal(playerRead.err, '')
  assert.equal(playerRead.rows[0].position, 'pitcher')
})

test('src never select(*) — new columns cannot break a star-shaped read', () => {
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (/\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }
  const hits: string[] = []
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    if (/select\(\s*['"]\*['"]\s*\)/.test(text)) hits.push(file.slice(SRC.length + 1))
  }
  assert.deepEqual(hits, [])
})
