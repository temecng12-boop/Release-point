/**
 * Migration 046 (roster-only players, assistant write, minor consent) in
 * PGlite (in-memory; never a real database):
 *   - applies cleanly on fresh and prod shapes, including twice;
 *   - the prod paste is byte-identical;
 *   - player_has_video_consent covers account + roster-only branches;
 *   - unique email index is created, or skipped with a report when
 *     duplicates already exist;
 *   - team coaches may write clips / notes / metrics; head-only stays
 *     owner-only;
 *   - player_video_consents is append-only for end users;
 *   - attaching an email later is allowed by the 042 hook;
 *   - an under-13 self-answer after accept blocks video;
 *   - main invite / clip write shapes still work after 046.
 * Run with: npx tsx --test supabase/tests/roster-consent-046.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, prodShapeDb, as, tryFile, u, migration } from './prod-shape/prod-fixture'

const AFTER_037 = [
  '037_age_bands.sql',
  '038_grandfather_existing_players.sql',
  '039_terms_history_tos_lock_grade_ranges.sql',
  '040_profile_freeze_marker.sql',
  '041_coach_invites.sql',
  '042_invite_only_signup_hook.sql',
  '043_under_13_launch_policy.sql',
  '044_player_positions_clip_kind.sql',
  '045_rate_limit_waitlist_clip_extras.sql',
]
const M046 = migration('046_roster_only_assistant_write_consent.sql')
const PASTE = join(__dirname, '..', '..', 'prod-sql-046-roster-only-assistant-write-consent.sql')

async function dbThrough045(shape: 'fresh' | 'prod'): Promise<PGlite> {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('037') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') {
    for (const m of ['035_drop_legacy_policies.sql', '036_avatars_private.sql', '037_age_bands.sql']) {
      assert.equal(await tryFile(db, migration(m)), '', m)
    }
  }
  for (const m of AFTER_037) {
    assert.equal(await tryFile(db, migration(m)), '', m)
    assert.equal(await tryFile(db, migration(m)), '', `${m} runs twice`)
  }
  return db
}

async function db046(shape: 'fresh' | 'prod' = 'fresh'): Promise<PGlite> {
  const db = await dbThrough045(shape)
  assert.equal(await tryFile(db, M046), '', `${shape} 046 first`)
  assert.equal(await tryFile(db, M046), '', `${shape} 046 second`)
  return db
}

const COACH = u(1), ASST = u(2), OTHER = u(3), KID = u(4)
const TEAM = u(21), TEAM_B = u(22)
const P_ROSTER = u(101), P_ACCT = u(102), P_OFF = u(103), P_OTHER = u(104)
const CLIP = u(201)

const hook = (db: PGlite, email: string | null) =>
  db.query<{ r: unknown }>(
    `SELECT public.before_user_created_invite_check($1) r`,
    [email === null ? { user: {} } : { user: { email } }],
  ).then((r) => r.rows[0].r as Record<string, { http_code?: number; message?: string }>)

const videoOf = async (db: PGlite, id: string) =>
  (await db.query<{ v: boolean }>(`SELECT public.player_has_video_consent($1) v`, [id])).rows[0].v

const hasIndex = async (db: PGlite) =>
  (await db.query<{ n: number }>(
    `SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND indexname='players_email_normalized_unique'`,
  )).rows[0].n

async function people(db: PGlite) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ($1,'c@x','{"role":"coach"}'),($2,'a@x','{"role":"coach"}'),
      ($3,'o@x','{"role":"coach"}'),($4,'k@x','{}')
     ON CONFLICT DO NOTHING`,
    [COACH, ASST, OTHER, KID],
  )
}

async function teamWorld(db: PGlite) {
  await people(db)
  await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'A','High School'),($3,$4,'B','High School')`, [TEAM, COACH, TEAM_B, OTHER])
  await db.query(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'organizer'),($1,$3,'assistant'),($4,$5,'organizer') ON CONFLICT DO NOTHING`, [TEAM, COACH, ASST, TEAM_B, OTHER])
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Roster','')`, [P_ROSTER, COACH])
  await db.query(`UPDATE players SET email=NULL, age_band_coach='18_plus' WHERE id=$1`, [P_ROSTER])
  await db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P_ROSTER, TEAM])
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Off','off@x')`, [P_OFF, COACH])
  await db.query(`UPDATE players SET age_band_coach='18_plus' WHERE id=$1`, [P_OFF])
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Other','other@x')`, [P_OTHER, OTHER])
  await db.query(`UPDATE players SET age_band_coach='18_plus' WHERE id=$1`, [P_OTHER])
  await db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P_OTHER, TEAM_B])
}

test('046 applies twice on a fresh database and on prod shape; paste is byte-identical', async () => {
  for (const shape of ['fresh', 'prod'] as const) {
    const db = await db046(shape)
    assert.equal((await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='player_video_consents'`,
    )).rows.length, 1, `${shape} consent table`)
    assert.equal(await hasIndex(db), 1, `${shape} unique email index`)
  }
  assert.equal(
    readFileSync(M046, 'utf8'),
    readFileSync(PASTE, 'utf8'),
    'prod-sql-046 must be byte-identical to the migration',
  )
})

test('046 refuses without 043 / 044 / 045 and changes nothing', async () => {
  const { db, unexpected } = await freshDb('037')
  assert.deepEqual(unexpected, [])
  for (const m of AFTER_037.filter((f) => !f.startsWith('043') && !f.startsWith('044') && !f.startsWith('045'))) {
    assert.equal(await tryFile(db, migration(m)), '', m)
  }
  assert.match(await tryFile(db, M046), /needs migration 043/)
  assert.equal((await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='player_video_consents'`,
  )).rows.length, 0)
})

test('player_has_video_consent: account players keep the 037 rule; roster-only uses coach band + consent', async () => {
  const db = await db046()
  await people(db)

  await db.query(`INSERT INTO players (id, coach_id, user_id, full_name, email, accepted_at) VALUES ($1,$2,$3,'Acct','acct@x',now())`, [P_ACCT, COACH, KID])
  await db.query(`UPDATE players SET age_band_self='18_plus', age_screen_at=now() WHERE id=$1`, [P_ACCT])
  assert.equal(await videoOf(db, P_ACCT), true, 'account 18_plus confirmed')

  await db.query(`UPDATE players SET age_band_self='13_17' WHERE id=$1`, [P_ACCT])
  assert.equal(await videoOf(db, P_ACCT), true, 'account 13_17 confirmed')

  await db.query(`UPDATE players SET age_band_self='under_13' WHERE id=$1`, [P_ACCT])
  assert.equal(await videoOf(db, P_ACCT), false, 'account under_13')

  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Adult',NULL)`, [P_ROSTER, COACH])
  await db.query(`UPDATE players SET age_band_coach='18_plus' WHERE id=$1`, [P_ROSTER])
  assert.equal(await videoOf(db, P_ROSTER), true, 'roster-only 18_plus')

  const teen = u(111)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Teen',NULL)`, [teen, COACH])
  await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [teen])
  assert.equal(await videoOf(db, teen), false, 'roster-only 13_17 without consent')

  assert.equal((await as(db, 'service',
    `INSERT INTO player_video_consents (player_id, kind, consent_given_by) VALUES ($1,'coach_is_guardian',$2)`,
    [teen, COACH],
  )).err, '')
  assert.equal(await videoOf(db, teen), true, 'roster-only 13_17 with guardian consent')

  const written = u(112)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Teen2',NULL)`, [written, COACH])
  await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [written])
  assert.equal((await as(db, 'service',
    `INSERT INTO player_video_consents (player_id, kind, consent_given_by) VALUES ($1,'coach_has_written_permission',$2)`,
    [written, COACH],
  )).err, '')
  assert.equal(await videoOf(db, written), true, 'roster-only 13_17 with written permission')

  const kid = u(113)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid',NULL)`, [kid, COACH])
  await db.query(`UPDATE players SET age_band_coach='under_13' WHERE id=$1`, [kid])
  assert.equal(await videoOf(db, kid), false, 'roster-only under_13 never true')
})

test('unique email index is created; duplicates are reported and skip the index', async () => {
  const clean = await db046()
  assert.equal(await hasIndex(clean), 1)
  await people(clean)
  assert.equal((await as(clean, 'service',
    `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'A','Same@X.Test')`,
    [u(301), COACH],
  )).err, '')
  const dupe = await as(clean, 'service',
    `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'B','same@x.test')`,
    [u(302), COACH],
  )
  assert.match(dupe.err, /unique|players_email_normalized_unique/i)

  const dirty = await dbThrough045('fresh')
  await people(dirty)
  await dirty.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'A','dup@x.test'),($3,$2,'B','dup@x.test')`, [u(311), COACH, u(312)])
  assert.equal(await tryFile(dirty, M046), '', '046 applies even with duplicate emails')
  assert.equal(await hasIndex(dirty), 0, 'index skipped when duplicates exist')
  const report = (await dirty.query<{ item: string; n: number }>(
    readFileSync(M046, 'utf8').split("NOTIFY pgrst, 'reload schema';")[1],
  )).rows
  const n = (item: string) => Number(report.find((r) => r.item === item)?.n)
  assert.ok(n('duplicate normalized emails (index skipped if > 0)') >= 1, JSON.stringify(report))
  assert.equal(n('players_email_normalized_unique'), 0)
})

test('team coaches can write clips, notes, and metrics; strangers and off-team cannot', async () => {
  const db = await db046()
  await teamWorld(db)
  const clipIns = await as(db, ASST,
    `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`,
    [CLIP, P_ROSTER, ASST, `${P_ROSTER}/1.mp4`],
  )
  assert.equal(clipIns.err, '', clipIns.err)

  assert.equal((await as(db, ASST,
    `INSERT INTO annotations (clip_id, created_by, type, origin_time) VALUES ($1,$2,'line',1)`,
    [CLIP, ASST],
  )).err, '')
  assert.equal((await as(db, ASST,
    `INSERT INTO timestamp_notes (clip_id, created_by, time_seconds, body) VALUES ($1,$2,1,'note')`,
    [CLIP, ASST],
  )).err, '')
  assert.equal((await as(db, ASST,
    `INSERT INTO pitch_metrics (clip_id, created_by, pitch_type, velocity) VALUES ($1,$2,'FB',90)`,
    [CLIP, ASST],
  )).err, '')

  const steal = await as(db, ASST,
    `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'no')`,
    [u(202), P_OTHER, ASST, `${P_OTHER}/1.mp4`],
  )
  assert.match(steal.err, /row-level security|violates/i)

  const off = await as(db, ASST,
    `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'off')`,
    [u(203), P_OFF, ASST, `${P_OFF}/1.mp4`],
  )
  assert.match(off.err, /row-level security|violates/i)

  const del = await as(db, ASST, `DELETE FROM players WHERE id=$1`, [P_ROSTER])
  assert.equal(del.n, 0, 'assistant cannot delete a player they do not own')
  assert.equal((await db.query(`SELECT 1 FROM players WHERE id=$1`, [P_ROSTER])).rows.length, 1)

  const staff = await as(db, ASST, `INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant')`, [TEAM, OTHER])
  assert.match(staff.err, /row-level security|violates|organizer/i)
})

test('player_video_consents is append-only for end users; service role can write', async () => {
  const db = await db046()
  await people(db)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Teen',NULL)`, [P_ROSTER, COACH])
  await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [P_ROSTER])

  const endUser = await as(db, COACH,
    `INSERT INTO player_video_consents (player_id, kind, consent_given_by) VALUES ($1,'coach_is_guardian',$2)`,
    [P_ROSTER, COACH],
  )
  assert.match(endUser.err, /written by the app only|42501|permission/i)

  const svc = await as(db, 'service',
    `INSERT INTO player_video_consents (player_id, kind, consent_given_by, guardian_coach_id) VALUES ($1,'coach_is_guardian',$2,$2) RETURNING id`,
    [P_ROSTER, COACH],
  )
  assert.equal(svc.err, '', svc.err)
  const id = svc.rows[0].id as string
  assert.match((await as(db, COACH, `UPDATE player_video_consents SET kind='coach_has_written_permission' WHERE id=$1`, [id])).err, /written by the app only|42501|permission/i)
  assert.match((await as(db, COACH, `DELETE FROM player_video_consents WHERE id=$1`, [id])).err, /written by the app only|42501|permission/i)
  assert.equal((await db.query(`SELECT count(*)::int n FROM player_video_consents`)).rows[0].n, 1)
})

test('042 hook allows an email attached later to a roster-only row', async () => {
  const db = await db046()
  await people(db)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Jr',NULL)`, [P_ROSTER, COACH])
  assert.equal((await hook(db, 'jr@x.test')).error?.http_code, 403, 'no email yet')
  await db.query(`UPDATE players SET email='  Jr@X.Test  ' WHERE id=$1`, [P_ROSTER])
  const stored = (await db.query<{ email: string }>(`SELECT email FROM players WHERE id=$1`, [P_ROSTER])).rows[0].email
  assert.equal(stored, 'jr@x.test')
  for (const email of ['jr@x.test', 'JR@X.TEST', '  Jr@X.Test  ']) {
    assert.deepEqual(await hook(db, email), {}, email)
  }
  await db.query(`UPDATE players SET user_id=$1, accepted_at=now() WHERE id=$2`, [KID, P_ROSTER])
  assert.equal((await hook(db, 'jr@x.test')).error?.http_code, 403, 'already linked')
})

test('under-13 self-answer after accept blocks video on the same player id', async () => {
  const db = await db046()
  await people(db)
  await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Jr',NULL)`, [P_ROSTER, COACH])
  await db.query(`UPDATE players SET age_band_coach='18_plus', email='jr@x.test' WHERE id=$1`, [P_ROSTER])
  await db.query(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`, [CLIP, P_ROSTER, COACH, `${P_ROSTER}/1.mp4`])
  await db.query(`UPDATE players SET user_id=$1, accepted_at=now() WHERE id=$2`, [KID, P_ROSTER])
  assert.equal((await as(db, 'service',
    `UPDATE players SET age_band_self='under_13', age_screen_at=now() WHERE id=$1`,
    [P_ROSTER],
  )).err, '')
  const row = (await db.query<{ age_band: string; id: string }>(`SELECT id, age_band FROM players WHERE email='jr@x.test'`)).rows
  assert.equal(row.length, 1)
  assert.equal(row[0].id, P_ROSTER)
  assert.equal(row[0].age_band, 'under_13')
  assert.equal(await videoOf(db, P_ROSTER), false)
  assert.equal((await db.query(`SELECT player_id FROM clips WHERE id=$1`, [CLIP])).rows[0].player_id, P_ROSTER)
})

test('main invite and clip write shapes still work after 046', async () => {
  const db = await db046()
  await people(db)
  const invite = await as(db, 'service',
    `INSERT INTO players (coach_id, full_name, email) VALUES ($1,'Sam New','sam@x') RETURNING id, email, user_id, positions`,
    [COACH],
  )
  assert.equal(invite.err, '', invite.err)
  assert.equal(invite.rows[0].email, 'sam@x')
  assert.equal(invite.rows[0].user_id, null)
  assert.deepEqual(invite.rows[0].positions, [])

  const roster = await as(db, 'service',
    `INSERT INTO players (coach_id, full_name, email, age_band_coach) VALUES ($1,'Roster Only',NULL,'18_plus') RETURNING id, email, user_id, age_band`,
    [COACH],
  )
  assert.equal(roster.err, '', roster.err)
  assert.equal(roster.rows[0].email, null)
  assert.equal(roster.rows[0].user_id, null)
  assert.equal(roster.rows[0].age_band, '18_plus')

  const clip = await as(db, 'service',
    `INSERT INTO clips (player_id, storage_path, title, session_date, uploaded_by)
     VALUES ($1,$2,'Bullpen',$3,$4) RETURNING clip_kind`,
    [roster.rows[0].id, `${roster.rows[0].id}/1.mp4`, '2026-10-01', COACH],
  )
  assert.equal(clip.err, '', clip.err)
  assert.equal(clip.rows[0].clip_kind, null)
})
