/**
 * Writes the app makes with an end user's own session (browser Supabase client,
 * or the session client in a server action), checked on the prod-shaped
 * database before and after migration 035, for every role the app allows.
 * PGlite only (in-memory; never a real database).
 *
 *   * Pitch imports used to insert pitch_metrics from the browser. After 035
 *     only the direct coach passes pitch_metrics_coach_all, so the player's
 *     own import and a team coach's import are refused there. The app now
 *     imports through importPitchMetrics (service role, after its own access
 *     check), which works after 035.
 *   * Clip, voice and bulk uploads use signed upload URLs created by the
 *     service role (getSignedUploadUrl), so the user's RLS is not involved.
 *   * "Report a problem" uploads its screenshot from the browser and inserts
 *     the report with the session client; 035 doesn't touch those policies.
 * Run with: npx tsx --test supabase/tests/prod-shape/client-writes-035.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { prodShapeDb, as, tryFile, u, migration } from './prod-fixture'

const M035 = migration('035_drop_legacy_policies.sql')
const D = u(41), TA = u(42), K = u(43), OC = u(44), G = u(45)
const P = u(141), C = u(241), CF = u(242), T = u(441)

async function setup(after035: boolean) {
  const { db } = await prodShapeDb()
  if (after035) assert.equal(await tryFile(db, M035), '')
  const q = (s: string, p: unknown[] = []) => db.query(s, p)
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'d@x','{"role":"coach"}'),($2,'ta@x','{"role":"coach"}'),($3,'k@x','{}'),($4,'oc@x','{"role":"coach"}'),($5,'g@x','{}')`, [D, TA, K, OC, G])
  await q(`INSERT INTO guardians (id, user_id, email) VALUES ($1,$2,'g@x')`, [u(541), G])
  await q(`INSERT INTO players (id, coach_id, user_id, full_name, guardian_id, consent_given_at) VALUES ($1,$2,$3,'k',$4,now())`, [P, D, K, u(541)])
  await q(`INSERT INTO teams (id, coach_id, name) VALUES ($1,$2,'T')`, [T, D])
  await q(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant')`, [T, TA])
  await q(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, T])
  await q(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'t'), ($5,$2,$3,'fake/nonexistent/video.mp4','fake')`, [C, P, D, `${P}/1.mp4`, CF])
  await q(`INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots','feedback-screenshots',false) ON CONFLICT (id) DO NOTHING`)
  return db
}

const browserMetricInsert = async (db: PGlite, uid: string) =>
  (await as(db, uid, `INSERT INTO pitch_metrics (clip_id, created_by, pitch_type, velocity, spin_axis, raw_data) VALUES ($1,$2,'Fastball',90,37.5,'{"a":"1"}'::jsonb),($1,$2,'Slider',81,270,'{"a":"2"}'::jsonb) RETURNING id`, [C, uid])).err

test('pitch import, old browser path: before 035 player and team coach could insert; after 035 only the direct coach can', async () => {
  const before = await setup(false)
  for (const uid of [D, K, TA]) assert.equal(await browserMetricInsert(before, uid), '', `before 035: ${uid}`)
  const after = await setup(true)
  assert.equal(await browserMetricInsert(after, D), '', 'direct coach still passes pitch_metrics_coach_all')
  for (const uid of [K, TA, OC, G]) assert.match(await browserMetricInsert(after, uid), /row-level security/, `after 035 refused: ${uid}`)
})

test('pitch import, new path: one multi-row service-role insert works after 035 and is all-or-nothing', async () => {
  const db = await setup(true)
  for (const by of [D, K]) {
    const r = await as(db, 'service', `INSERT INTO pitch_metrics (clip_id, created_by, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa, raw_data)
      VALUES ($1,$2,'Fastball',90.1,2250,37.5,8.1,18.7,6.4,-5.1,'{"Pitch Type":"Fastball"}'::jsonb),($1,$2,'Slider',81,2500,270,-6,2,6.1,null,'{"Pitch Type":"Slider"}'::jsonb)
      RETURNING id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa`, [C, by])
    assert.equal(r.err, '', `service role insert created_by ${by}`)
    assert.equal(r.rows.length, 2)
  }
  // The player then reads the imported rows (pitch_metrics_player_select).
  assert.equal((await as(db, K, `SELECT count(*)::int c FROM pitch_metrics WHERE clip_id=$1`, [C])).rows[0].c, 4)
  // One bad row fails the whole statement: nothing from that batch is saved.
  const bad = await as(db, 'service', `INSERT INTO pitch_metrics (clip_id, created_by, pitch_type) VALUES ($1,$2,'ok'),($3,$2,'bad clip')`, [C, D, u(999)])
  assert.match(bad.err, /foreign key/)
  assert.equal((await db.query<{ c: number }>(`SELECT count(*)::int c FROM pitch_metrics WHERE pitch_type='ok'`)).rows[0].c, 0)
})

test('other end-user writes after 035, per allowed role', async () => {
  const db = await setup(true)
  // Signed upload URLs (clips, voice, bulk upload) are created by the service role.
  for (const name of [`${P}/2.mp4`, `${P}/${C}/voice.webm`])
    assert.equal((await as(db, 'service', `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [name])).err, '', name)
  // Voice note playback URL from the browser (direct coach after recording).
  assert.equal((await as(db, D, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='clips' AND name=$1`, [`${P}/${C}/voice.webm`])).rows[0].c, 1)
  // Report a problem: screenshot upload from the browser + report row with the session client, any signed-in role.
  for (const uid of [D, TA, K, G]) {
    const shot = await as(db, uid, `INSERT INTO storage.objects (bucket_id, name) VALUES ('feedback-screenshots', $1)`, [`${uid}/${u(700)}.png`])
    assert.equal(shot.err, '', `feedback screenshot ${uid}`)
    const rep = await as(db, uid, `INSERT INTO feedback_reports (user_id, message) VALUES ($1, 'x')`, [uid])
    assert.equal(rep.err, '', `feedback report ${uid}`)
  }
  // Session-client writes in server actions (direct coach only by design).
  assert.equal((await as(db, D, `UPDATE clips SET hitting_metrics='{}'::jsonb WHERE id=$1`, [C])).n, 1, 'hitting data delete: direct coach')
  assert.equal((await as(db, D, `SELECT * FROM save_clip_notes($1, md5(''), 'n')`, [C])).rows[0]?.saved, true, 'notes: direct coach')
  const ins = await as(db, D, `INSERT INTO pitch_metrics (id, clip_id, created_by) VALUES ($1,$2,$3)`, [u(801), C, D]); assert.equal(ins.err, '')
  assert.equal((await as(db, D, `DELETE FROM pitch_metrics WHERE id=$1`, [u(801)])).n, 1, 'pitch row delete: direct coach')
  assert.equal((await as(db, D, `UPDATE teams SET name='T2' WHERE id=$1`, [T])).n, 1, 'team rename: owner')
})

test('known row: prod\'s fake test clip (storage_path outside its player folder) after 035: direct-coach hitting-data edits refused, notes still save', async () => {
  const hit = (db: PGlite, id: string) => as(db, D, `UPDATE clips SET hitting_metrics='{}'::jsonb WHERE id=$1`, [id])
  const notes = async (db: PGlite, id: string) => (await as(db, D, `SELECT * FROM save_clip_notes($1, md5(''), 'n')`, [id])).rows[0]?.saved
  const before = await setup(false)
  assert.equal((await hit(before, CF)).n, 1, 'before 035: hitting edit on the fake clip')
  assert.equal(await notes(before, CF), true, 'before 035: notes on the fake clip')
  const after = await setup(true)
  // clips_direct_coach_update's WITH CHECK needs '<player_id>/'; writeHittingMetrics (session client) is refused.
  assert.match((await hit(after, CF)).err, /row-level security/, 'after 035: hitting edit on the fake clip refused')
  assert.equal((await hit(after, C)).n, 1, 'after 035: compliant clip still edits')
  // save_clip_notes sets rp.clip_notes_rpc, so 031's clips_team_coach_notes_update (no path rule) also
  // applies to the direct coach: notes are not affected by the prefix rule.
  assert.equal(await notes(after, CF), true, 'after 035: notes on the fake clip still save')
})
