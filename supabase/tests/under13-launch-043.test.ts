/**
 * Migration 043 (under-13 launch policy) in PGlite (in-memory; never a real
 * database):
 *   1. players INSERT carrying an under-13 COACH band is refused with an
 *      honest error — as the coach (RLS passes, the trigger fires first) and
 *      as the service role (RLS bypassed, so only the trigger can refuse).
 *      Bandless inserts (the invite path) and 13_17 coach-band inserts still
 *      work; UPDATEs to under_13 stay allowed (Edit Player, the freeze,
 *      linkPlayerRow, createOwnPlayerRow, grandfathered rows).
 *   2. The lessons TABLE refuses rows for players without video consent
 *      (mirrors clips_require_video_consent, same error). The lessons BUCKET
 *      has no UPDATE policy, so direct UPDATEs are already denied by RLS
 *      (asserted, not changed).
 *   3. (c) verification: a player frozen by their OWN under-13 answer (the
 *      age screen) has video blocked on every path (clips, lessons, both
 *      buckets) and matches the frozen-gate predicate.
 *   4. The prod paste is migration 043 verbatim (same statements, same order).
 * Applies on main (037 then 038-042 then 043). 043 needs nothing 042 creates.
 * Each file applies twice.
 * Run with: npx tsx --test supabase/tests/under13-launch-043.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, prodShapeDb, as, tryFile, u, migration } from './prod-shape/prod-fixture'

const M = (n: string) => migration(n)
const NEXT_MAIN = [
  '037_age_bands.sql',
  '038_grandfather_existing_players.sql',
  '039_terms_history_tos_lock_grade_ranges.sql',
  '040_profile_freeze_marker.sql',
  '041_coach_invites.sql',
  '042_invite_only_signup_hook.sql',
  '043_under_13_launch_policy.sql',
]
const M035 = M('035_drop_legacy_policies.sql')
const M036 = M('036_avatars_private.sql')
const M037 = M('037_age_bands.sql')

async function db043(shape: 'fresh' | 'prod', seed?: (db: PGlite) => Promise<void>) {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('037') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') {
    for (const m of [M035, M036, M037]) assert.equal(await tryFile(db, m), '', m)
  }
  if (seed) await seed(db)
  for (const m of NEXT_MAIN) {
    assert.equal(await tryFile(db, M(m)), '', m)
    assert.equal(await tryFile(db, M(m)), '', `${m} runs twice`)
  }
  return db
}

const COACH = u(1), KID = u(3)

async function people(db: PGlite) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c@x','{"role":"coach"}'),($2,'k@x','{}') ON CONFLICT DO NOTHING`,
    [COACH, KID],
  )
}

const bandOf = async (db: PGlite, id: string) =>
  (await db.query<{ age_band: string | null; age_band_source: string | null }>(
    `SELECT age_band, age_band_source FROM players WHERE id=$1`, [id])).rows[0]
const videoOf = async (db: PGlite, id: string) =>
  (await db.query<{ v: boolean }>(`SELECT public.player_has_video_consent($1) v`, [id])).rows[0].v

for (const shape of ['fresh', 'prod'] as const) {
  test(`${shape}: 043 refuses a players INSERT with an under-13 coach band (coach and service role)`, async () => {
    const db = await db043(shape)
    await people(db)
    // As the coach: the RLS policy (032) passes (coach_id = self, no linked
    // user), so this refusal is the new trigger, firing before 037's
    // players_restrict_insert (name order: refuse < restrict < set).
    const coach = await as(db, COACH,
      `INSERT INTO players (id, coach_id, full_name, email, age_band_coach) VALUES ($1,$2,'Kid','kid@x','under_13')`, [u(101), COACH])
    assert.match(coach.err, /Players under 13 can't be added/, `coach insert refused honestly (${coach.err})`)
    assert.doesNotMatch(coach.err, /coming soon|yet\./i, 'no promise or timeline')
    assert.doesNotMatch(coach.err, /set by the app/, 'not 037\u2019s restrict message: the new trigger fired first')
    // As the service role (the app/direct path, RLS bypassed): only the
    // trigger can refuse.
    const svc = await as(db, 'service',
      `INSERT INTO players (id, coach_id, full_name, email, age_band_coach) VALUES ($1,$2,'Kid','kid2@x','under_13')`, [u(102), COACH])
    assert.match(svc.err, /Players under 13 can't be added/, `service insert refused (${svc.err})`)
    assert.doesNotMatch(svc.err, /coming soon|yet\./i, 'no promise or timeline')
    assert.equal((await db.query<{ n: number }>(`SELECT count(*) n FROM players`)).rows[0].n, 0, 'nothing saved')
  })

  test(`${shape}: bandless and 13_17 inserts still work; 043 stores nothing and changes no existing row`, async () => {
    const db = await db043(shape)
    await people(db)
    // Grandfathered-style row first: 043 must leave it alone.
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Old','old@x')`, [u(110), COACH])
    await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(110)])
    const before = await bandOf(db, u(110))
    // The invite path (bandless, service role) and a 13_17 coach band.
    assert.equal((await as(db, 'service',
      `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'New','new@x')`, [u(111), COACH])).err, '')
    assert.equal((await as(db, 'service',
      `INSERT INTO players (id, coach_id, full_name, email, age_band_coach) VALUES ($1,$2,'Teen','teen@x','13_17')`, [u(112), COACH])).err, '')
    // The invite path as the coach through RLS (policy 032).
    assert.equal((await as(db, COACH,
      `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Rls','rls@x')`, [u(113), COACH])).err, '')
    assert.deepEqual(await bandOf(db, u(110)), before, 'existing row untouched')
    assert.equal((await bandOf(db, u(112))).age_band, '13_17')
    assert.equal(await videoOf(db, u(112)), true)
  })

  test(`${shape}: UPDATEs to under 13 stay allowed — Edit Player, freeze, link and grandfathered rows`, async () => {
    const db = await db043(shape)
    await people(db)
    // Edit Player shape: coach band set on an existing row (service role, as
    // setCoachAgeBand writes).
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid','kid@x')`, [u(120), COACH])
    assert.equal((await as(db, 'service', `UPDATE players SET age_band_coach='under_13' WHERE id=$1`, [u(120)])).err, '')
    assert.equal((await bandOf(db, u(120))).age_band, 'under_13', 'coach under-13 answer freezes video')
    assert.equal(await videoOf(db, u(120)), false)
    // linkPlayerRow shape: claimed by the player, then the player's own
    // answer (recordOwnAgeAnswer writes age_band_self + age_screen_at).
    await db.query(`INSERT INTO players (id, coach_id, full_name, email, user_id, accepted_at) VALUES ($1,$2,'Kid2','kid2@x',$3,now())`, [u(121), COACH, KID])
    assert.equal((await as(db, 'service',
      `UPDATE players SET age_band_self='under_13', age_screen_at=now() WHERE id=$1`, [u(121)])).err, '')
    assert.equal((await bandOf(db, u(121))).age_band, 'under_13')
    // createOwnPlayerRow freeze shape: INSERT with only a self under-13 band
    // (no name, no email) is NOT a coach add and must pass.
    assert.equal((await as(db, 'service',
      `INSERT INTO players (id, user_id, full_name, email, accepted_at, age_band_self, age_screen_at) VALUES ($1,$2,'',NULL,now(),'under_13',now())`, [u(122), KID])).err, '')
    assert.equal((await bandOf(db, u(122))).age_band, 'under_13')
    // End-user coaches still can't write age columns directly (037 P3,
    // unchanged): the honest app path is setCoachAgeBand.
    assert.match((await as(db, COACH, `UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(120)])).err, /coaches cannot/)
  })

  test(`${shape}: lessons table refuses rows without video consent (same error as clips)`, async () => {
    const db = await db043(shape)
    await people(db)
    // A confirmed teen: clip + lesson save fine.
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Teen','teen@x')`, [u(130), COACH])
    await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(130)])
    await db.query(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`, [u(131), u(130), COACH, `${u(130)}/1.mp4`])
    assert.equal((await as(db, 'service',
      `INSERT INTO lessons (clip_id, player_id, coach_id, media_path, mime) VALUES ($1,$2,$3,$4,'audio/webm')`, [u(131), u(130), COACH, `${u(130)}/${u(131)}/l.webm`])).err, '')
    // An under-13 player: lesson insert refused, like clips.
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid','kid@x')`, [u(140), COACH])
    await db.query(`UPDATE players SET age_band_coach='under_13' WHERE id=$1`, [u(140)])
    await db.query(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`, [u(141), u(130), COACH, `${u(130)}/2.mp4`])
    const refused = await as(db, 'service',
      `INSERT INTO lessons (clip_id, player_id, coach_id, media_path, mime) VALUES ($1,$2,$3,$4,'audio/webm')`, [u(141), u(140), COACH, `${u(140)}/${u(141)}/l.webm`])
    assert.match(refused.err, /video consent for this player is still pending/, `lesson for under-13 refused (${refused.err})`)
    // Re-pointing a lesson row at an under-13 player is refused too.
    const moved = await as(db, 'service', `UPDATE lessons SET player_id=$1 WHERE clip_id=$2`, [u(140), u(131)])
    assert.match(moved.err, /video consent for this player is still pending/)
    // Unknown band (no answer yet): refused, as with clips.
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'New','new@x')`, [u(150), COACH])
    const unknown = await as(db, 'service',
      `INSERT INTO lessons (clip_id, player_id, coach_id, media_path, mime) VALUES ($1,$2,$3,$4,'audio/webm')`, [u(131), u(150), COACH, `${u(150)}/${u(131)}/l.webm`])
    assert.match(unknown.err, /video consent for this player is still pending/)
    // End users never had table access (025: SELECT-only + service_role ALL).
    assert.ok((await as(db, COACH,
      `INSERT INTO lessons (clip_id, player_id, coach_id, media_path) VALUES ($1,$2,$3,$4)`, [u(131), u(130), COACH, 'x/y.webm'])).err,
      'authenticated lessons insert denied by RLS')
  })

  test(`${shape}: lessons bucket UPDATEs are already denied (no UPDATE policy; asserted, not changed)`, async () => {
    const db = await db043(shape)
    await people(db)
    await db.query(`INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Teen','teen@x')`, [u(160), COACH])
    await db.query(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [u(160)])
    assert.equal((await as(db, COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [`${u(160)}/c/l.webm`])).err, '',
      'lessons bucket INSERT still consent-gated and working (037 P6 intact)')
    // RLS with no UPDATE policy updates zero rows silently (no error), so pin
    // the row count and the unchanged row instead of an error.
    await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [`${u(160)}/c/own.webm`])
    const upd = await as(db, COACH, `UPDATE storage.objects SET name='hijacked.webm' WHERE bucket_id='lessons' AND name=$1`, [`${u(160)}/c/own.webm`])
    assert.equal(upd.err, '')
    assert.equal(upd.n, 0, 'no lessons-bucket row is updatable by an end user')
    assert.equal(
      (await db.query(`SELECT name FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [`${u(160)}/c/own.webm`])).rows.length,
      1, 'the row is unchanged')
  })

  test(`${shape}: (c) a player frozen by their own under-13 answer is blocked on every video path`, async () => {
    const db = await db043(shape)
    await people(db)
    // The age screen's under-13 answer on a claimed row (recordOwnAgeAnswer
    // writes age_band_self; the trigger works out under_13).
    await db.query(`INSERT INTO players (id, coach_id, full_name, email, user_id, accepted_at) VALUES ($1,$2,'Kid','kid@x',$3,now())`, [u(170), COACH, KID])
    assert.equal((await as(db, 'service',
      `UPDATE players SET age_band_self='under_13', age_screen_at=now() WHERE id=$1`, [u(170)])).err, '')
    const frozen = (await db.query<{ age_band: string; age_band_self: string; age_band_coach: string }>(
      `SELECT age_band, age_band_self, age_band_coach FROM players WHERE id=$1`, [u(170)])).rows[0]
    assert.equal(frozen.age_band, 'under_13')
    assert.equal(frozen.age_band_self, 'under_13')
    assert.ok(frozen.age_band === 'under_13' && !!frozen.age_band_self,
      'matches the frozen-gate predicate (isFrozenUnder13: under_13 from an answer, not an age group)')
    assert.equal(await videoOf(db, u(170)), false)
    assert.match((await as(db, 'service',
      `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'c')`, [u(171), u(170), COACH, `${u(170)}/1.mp4`])).err,
      /still pending/, 'clips blocked')
    assert.ok((await as(db, COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${u(170)}/1.mp4`])).err,
      'clips bucket blocked')
    assert.ok((await as(db, COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [`${u(170)}/c/l.webm`])).err,
      'lessons bucket blocked')
  })
}

test('prod paste is migration 043 verbatim (same statements, same order)', async () => {
  const { readFileSync } = await import('node:fs')
  const mig = readFileSync(new URL('../migrations/043_under_13_launch_policy.sql', import.meta.url), 'utf8')
  const paste = readFileSync(new URL('../../prod-sql-043-under-13-launch-policy.sql', import.meta.url), 'utf8')
  assert.match(paste, /BEGIN/, 'one transaction')
  assert.match(paste, /COMMIT/, 'commits')
  assert.match(paste, /players_refuse_under_13_coach_insert/, 'the players guard')
  assert.match(paste, /lessons_require_video_consent/, 'the lessons guard')
  assert.match(paste, /under-13 players/, 'the read-only report')
  assert.deepEqual(sqlStatements(paste), sqlStatements(mig))
})

/** Split SQL into statements: strip full-line comments, collapse whitespace. */
function sqlStatements(sql: string): string[] {
  const noComments = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  return noComments
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}
