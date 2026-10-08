/**
 * Migration 044 (multi-value positions + clip_kind) in PGlite:
 *   - applies cleanly, including twice (idempotent);
 *   - backfills positions from every historical players.position value;
 *   - keeps the old column;
 *   - CHECK limits the six tags and clip_kind pitching|hitting;
 *   - whoever can update position today can update positions (coach yes;
 *     guardian / claiming player / stranger no);
 *   - the prod paste is byte-identical to the migration.
 * Run with: npx tsx --test supabase/tests/positions-044.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, prodShapeDb, as, tryFile, u, migration } from './prod-shape/prod-fixture'

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
const PASTE = join(__dirname, '..', '..', 'prod-sql-044-player-positions-clip-kind.sql')

async function dbThrough043(shape: 'fresh' | 'prod'): Promise<PGlite> {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('037') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') {
    for (const m of ['035_drop_legacy_policies.sql', '036_avatars_private.sql', '037_age_bands.sql']) {
      assert.equal(await tryFile(db, migration(m)), '', m)
    }
  }
  for (const m of NEXT) {
    assert.equal(await tryFile(db, migration(m)), '', m)
    assert.equal(await tryFile(db, migration(m)), '', `${m} runs twice`)
  }
  return db
}

const COACH = u(1), KID = u(3), GUARD = u(5), OTHER = u(7)

async function people(db: PGlite) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ($1,'c@x','{"role":"coach"}'),($2,'k@x','{}'),($3,'g@x','{}'),($4,'o@x','{"role":"coach"}')
     ON CONFLICT DO NOTHING`,
    [COACH, KID, GUARD, OTHER],
  )
}

/** Drop the old single-value CHECK so we can seed historical two-way spellings. */
async function dropPositionCheck(db: PGlite) {
  const names = (await db.query<{ conname: string }>(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.players'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%position%'
       AND pg_get_constraintdef(oid) NOT ILIKE '%positions%'
  `)).rows.map((r) => r.conname)
  for (const name of names) await db.exec(`ALTER TABLE public.players DROP CONSTRAINT ${JSON.stringify(name).replace(/"/g, '')}`)
  // JSON.stringify adds quotes; use ident quoting instead if that failed.
  for (const name of names) {
    await db.exec(`ALTER TABLE public.players DROP CONSTRAINT IF EXISTS "${name.replace(/"/g, '""')}"`)
  }
}

const SEED: { id: string; pos: string; want: string[] }[] = [
  { id: u(201), pos: 'pitcher', want: ['pitcher'] },
  { id: u(202), pos: 'hitter', want: ['hitter'] },
  { id: u(203), pos: 'pitcher+hitter', want: ['two-way'] },
  { id: u(204), pos: 'two-way', want: ['two-way'] },
  { id: u(205), pos: 'two_way', want: ['two-way'] },
  { id: u(206), pos: 'catcher', want: ['catcher'] },
  { id: u(207), pos: 'infield', want: ['infield'] },
  { id: u(208), pos: 'outfield', want: ['outfield'] },
  { id: u(209), pos: 'RHP', want: ['pitcher'] },
  { id: u(210), pos: '', want: [] },
]

async function seedPositions(db: PGlite) {
  await people(db)
  await dropPositionCheck(db)
  for (const row of SEED) {
    await db.query(
      `INSERT INTO players (id, coach_id, full_name, email, position) VALUES ($1,$2,$3,$4,$5)`,
      [row.id, COACH, row.pos || 'Empty', `${row.id}@x`, row.pos || null],
    )
  }
}

test('044 applies cleanly (also twice) on a fresh database and on prod shape', async () => {
  for (const shape of ['fresh', 'prod'] as const) {
    const db = await dbThrough043(shape)
    assert.equal(await tryFile(db, M044), '', `${shape} first`)
    assert.equal(await tryFile(db, M044), '', `${shape} second`)
  }
})

test('backfill maps every historical position value; a second run does not overwrite', async () => {
  const db = await dbThrough043('fresh')
  await seedPositions(db)
  assert.equal(await tryFile(db, M044), '')
  for (const row of SEED) {
    const got = (await db.query<{ positions: string[] }>(`SELECT positions FROM players WHERE id=$1`, [row.id])).rows[0].positions
    assert.deepEqual(got ?? [], row.want, row.pos || '(empty)')
  }
  const leftover = (await db.query<{ n: number }>(`
    SELECT count(*)::int n FROM players
     WHERE position IS NOT NULL AND btrim(position) <> '' AND (positions IS NULL OR positions = '{}')
  `)).rows[0].n
  assert.equal(leftover, 0, 'old value but empty positions (expect 0)')
  // A later chip save must survive a second apply.
  await db.query(`UPDATE players SET positions = ARRAY['catcher']::text[] WHERE id=$1`, [u(201)])
  assert.equal(await tryFile(db, M044), '', 'runs twice')
  const kept = (await db.query<{ positions: string[] }>(`SELECT positions FROM players WHERE id=$1`, [u(201)])).rows[0].positions
  assert.deepEqual(kept, ['catcher'], 'second run does not overwrite a later save')
  // Old column still there.
  const cols = (await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='players' AND column_name IN ('position','positions')`,
  )).rows.map((r) => r.column_name).sort()
  assert.deepEqual(cols, ['position', 'positions'])
})

test('CHECK rejects tags outside the six and clip_kind outside pitching|hitting', async () => {
  const db = await dbThrough043('fresh')
  assert.equal(await tryFile(db, M044), '')
  await people(db)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid','kid@x')`, [u(301), COACH])
  await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(301)])
  const badPos = await as(db, 'service', `UPDATE players SET positions = ARRAY['shortstop'] WHERE id=$1`, [u(301)])
  assert.match(badPos.err, /players_positions_allowed|check constraint/i)
  await db.query(
    `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`,
    [u(311), u(301), COACH, `${u(301)}/1.mp4`],
  )
  const badKind = await as(db, 'service', `UPDATE clips SET clip_kind='fielding' WHERE id=$1`, [u(311)])
  assert.match(badKind.err, /clips_clip_kind_allowed|check constraint/i)
  assert.equal((await as(db, 'service', `UPDATE clips SET clip_kind='hitting' WHERE id=$1`, [u(311)])).err, '')
  assert.equal((await as(db, 'service', `UPDATE clips SET clip_kind=NULL WHERE id=$1`, [u(311)])).err, '')
})

test('RLS: coach can update positions (same as position); guardian, player, stranger cannot', async () => {
  const db = await dbThrough043('fresh')
  assert.equal(await tryFile(db, M044), '')
  await people(db)
  await db.query(
    `INSERT INTO guardians (id, user_id, email, full_name) VALUES ($1,$2,'g@x','G') ON CONFLICT DO NOTHING`,
    [u(40), GUARD],
  )
  await db.query(
    `INSERT INTO players (id, coach_id, user_id, guardian_id, full_name, email, position) VALUES ($1,$2,$3,$4,'Kid','kid@x','pitcher')`,
    [u(401), COACH, KID, u(40)],
  )
  assert.equal((await as(db, COACH, `UPDATE players SET positions = ARRAY['catcher','hitter'] WHERE id=$1`, [u(401)])).n, 1, 'coach can')
  const row = (await db.query<{ positions: string[]; position: string | null }>(`SELECT positions, position FROM players WHERE id=$1`, [u(401)])).rows[0]
  assert.deepEqual(row.positions, ['catcher', 'hitter'])
  // Guardian: 037 lets them change nothing. RLS may filter (n=0) or the
  // restrict_update trigger may raise — either way the row must not change.
  const g = await as(db, GUARD, `UPDATE players SET positions = ARRAY['pitcher'] WHERE id=$1`, [u(401)], 'g@x')
  assert.ok(g.n === 0 || /not allowed|policy|42501/i.test(g.err), `guardian refused (${g.err || `n=${g.n}`})`)
  const p = await as(db, KID, `UPDATE players SET positions = ARRAY['pitcher'] WHERE id=$1`, [u(401)])
  assert.ok(p.n === 0 || /policy|42501|not allowed/i.test(p.err), `player JWT cannot update positions (${p.err || `n=${p.n}`})`)
  const o = await as(db, OTHER, `UPDATE players SET positions = ARRAY['pitcher'] WHERE id=$1`, [u(401)])
  assert.ok(o.n === 0 || /policy|42501/i.test(o.err), `other coach cannot (${o.err || `n=${o.n}`})`)
  const kept = (await db.query<{ positions: string[] }>(`SELECT positions FROM players WHERE id=$1`, [u(401)])).rows[0].positions
  assert.deepEqual(kept, ['catcher', 'hitter'], 'non-coach writes did not stick')
})

test('guard refuses to run before 043; nothing is changed', async () => {
  const { db, unexpected } = await freshDb('037')
  assert.deepEqual(unexpected, [])
  for (const m of NEXT.slice(0, -1)) assert.equal(await tryFile(db, migration(m)), '', m)
  const err = await tryFile(db, M044)
  assert.match(err, /needs migration 043/)
  const cols = (await db.query<{ n: number }>(
    `SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='players' AND column_name='positions'`,
  )).rows[0].n
  assert.equal(cols, 0, 'positions not added when the guard fires')
})

test('prod paste is byte-identical to migration 044', () => {
  const mig = readFileSync(M044)
  const paste = readFileSync(PASTE)
  assert.deepEqual(paste, mig)
})
