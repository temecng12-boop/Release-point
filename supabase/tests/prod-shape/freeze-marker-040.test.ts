/**
 * Migration 040 (profiles.frozen_at / deletion_requested_at for the 14-day
 * deletion job, and a guard so users can't set them or edit a frozen
 * profile) in PGlite (in-memory; never a real database), on the prod shape
 * (035-039 applied) and on a fresh database (001-039), each run twice.
 * Run with: npx tsx --test supabase/tests/prod-shape/freeze-marker-040.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { prodShapeDb, freshDb, as, tryFile, u, migration } from './prod-fixture'
import { PROFILE_PERSONAL_FIELDS } from '../../../src/lib/under13-freeze'

const M = (n: string) => migration(n)
const M040 = M('040_profile_freeze_marker.sql')
const ROOT = join(__dirname, '..', '..', '..', '..')

async function db039(shape: 'prod' | 'fresh') {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('040') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') {
    for (const f of ['035_drop_legacy_policies.sql', '036_avatars_private.sql', '037_age_bands.sql', '038_grandfather_existing_players.sql', '039_terms_history_tos_lock_grade_ranges.sql']) {
      assert.equal(await tryFile(db, M(f)), '', f)
    }
  }
  return db
}

const KID = u(11), TEEN = u(12), COACH = u(13), NEW = u(14), CKID = u(15)
async function seed(db: PGlite) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'k@x','{"full_name":"Kid K"}'),($2,'t@x','{}'),($3,'c@x','{"role":"coach"}') ON CONFLICT DO NOTHING`, [KID, TEEN, COACH])
  await db.query(`UPDATE profiles SET full_name = 'Kid K', avatar_url = $2 WHERE id = $1`, [KID, `avatars/${KID}.jpg`])
  await db.query(`UPDATE profiles SET full_name = 'Teen T' WHERE id = $1`, [TEEN])
  // KID froze themselves with an under-13 answer before 040; TEEN answered 13-17.
  await db.query(`INSERT INTO players (id, user_id, full_name, email) VALUES ($1,$2,'','k@x'),($3,$4,'Teen T','t@x')`, [u(101), KID, u(102), TEEN])
  await db.query(`UPDATE players SET age_band_self = 'under_13', age_screen_at = '2026-10-04T12:00:00Z' WHERE id = $1`, [u(101)])
  await db.query(`UPDATE players SET age_band_self = '13_17', age_screen_at = now() WHERE id = $1`, [u(102)])
  // CKID: frozen by the coach's under-13 band, never answered themselves.
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'ck@x','{"full_name":"Coach Kid"}') ON CONFLICT DO NOTHING`, [CKID])
  await db.query(`UPDATE profiles SET full_name = 'Coach Kid' WHERE id = $1`, [CKID])
  await db.query(`INSERT INTO players (id, user_id, full_name, email, coach_id) VALUES ($1,$2,'Coach Kid','ck@x',$3)`, [u(103), CKID, COACH])
  await db.query(`UPDATE players SET age_band_coach = 'under_13', age_band = 'under_13', age_band_source = 'coach' WHERE id = $1`, [u(103)])
}
const prof = async (db: PGlite, id: string) => (await db.query<{ full_name: string | null; avatar_url: string | null }>(`SELECT full_name, avatar_url FROM profiles WHERE id = $1`, [id])).rows[0]
const marks = async (db: PGlite, id: string) => (await db.query<{ f: string | null; d: string | null }>(`SELECT frozen_at::text f, deletion_requested_at::text d FROM profiles WHERE id = $1`, [id])).rows[0]

for (const shape of ['prod', 'fresh'] as const) {
  test(`${shape}: 040 adds the marks, backfills own under-13 answers once, runs twice, report works`, async () => {
    const db = await db039(shape)
    await seed(db)
    assert.equal(await tryFile(db, M040), '')
    const k1 = await marks(db, KID)
    assert.ok(k1.f && k1.d, 'own under-13 answer: frozen and marked for deletion')
    assert.equal(new Date(k1.f!.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString(), '2026-10-04T12:00:00.000Z', 'at the time of the answer')
    assert.deepEqual(await prof(db, KID), { full_name: null, avatar_url: null }, 'own under-13 answer: no name or photo left on the profile')
    assert.deepEqual(await marks(db, TEEN), { f: null, d: null })
    assert.deepEqual(await marks(db, COACH), { f: null, d: null })
    assert.equal((await db.query<{ age_band: string }>(`SELECT age_band FROM players WHERE id = $1`, [u(103)])).rows[0].age_band, 'under_13', 'control: CKID is coach-frozen')
    assert.deepEqual(await marks(db, CKID), { f: null, d: null }, 'coach-set freeze: not marked (PR B decides)')
    assert.equal((await prof(db, CKID)).full_name, 'Coach Kid', 'coach-set freeze: not blanked here')
    assert.equal((await prof(db, TEEN)).full_name, 'Teen T', 'an older answer keeps the name')
    assert.equal(await tryFile(db, M040), '', 'runs twice')
    assert.deepEqual(await marks(db, KID), k1, 'second run changes nothing')
    const rep = (await db.query<{ item: string; n: number }>(readFileSync(M040, 'utf8').split("NOTIFY pgrst, 'reload schema';")[1])).rows
    const n = (item: string) => Number(rep.find((r) => r.item === item)?.n)
    assert.equal(n('freeze guard trigger in place (expect 1)'), 1, JSON.stringify(rep))
    assert.equal(n('marked profiles still holding a name or photo (expect 0)'), 0)
    assert.equal(n('profiles marked for deletion'), 1)
    assert.equal(n('frozen profiles'), 1)
  })

  test(`${shape}: 040 guard: users can't set or clear the marks, or edit a frozen profile; the service role (the app's scrub) can`, async () => {
    const db = await db039(shape)
    await seed(db)
    assert.equal(await tryFile(db, M040), '')
    // TEEN (not frozen) can edit their own profile but not the marks.
    assert.equal((await as(db, TEEN, `UPDATE profiles SET full_name = 'Teen Two' WHERE id = auth.uid()`)).n, 1)
    for (const set of ['frozen_at = now()', 'deletion_requested_at = now()']) {
      assert.match((await as(db, TEEN, `UPDATE profiles SET ${set} WHERE id = auth.uid()`)).err, /set by the app/, set)
    }
    // KID (frozen) can't edit anything on their profile, or clear the marks.
    for (const set of [`full_name = 'Kid K'`, `avatar_url = 'avatars/${KID}.png'`, 'frozen_at = NULL', 'deletion_requested_at = NULL']) {
      assert.match((await as(db, KID, `UPDATE profiles SET ${set} WHERE id = auth.uid()`)).err, /on hold/, set)
    }
    // Own-row insert with the marks is refused.
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1,'n@x')`, [NEW])
    await db.query(`DELETE FROM profiles WHERE id = $1`, [NEW])
    assert.match((await as(db, NEW, `INSERT INTO profiles (id, full_name, role, deletion_requested_at) VALUES ($1,'N','player',now())`, [NEW])).err, /set by the app/)
    assert.equal((await as(db, NEW, `INSERT INTO profiles (id, full_name, role) VALUES ($1,'N','player')`, [NEW])).err, '')
    // The app's scrub (service role): every personal field blanked, the marks set once.
    const cols = Object.keys(PROFILE_PERSONAL_FIELDS)
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
    const vals = cols.map((c) => (PROFILE_PERSONAL_FIELDS as Record<string, unknown>)[c])
    assert.equal((await as(db, 'service', `UPDATE profiles SET ${sets} WHERE id = $1`, [TEEN, ...vals])).n, 1, 'all fields the app blanks exist')
    assert.equal((await as(db, 'service', `UPDATE profiles SET frozen_at = now() WHERE id = $1 AND frozen_at IS NULL`, [TEEN])).n, 1)
    assert.equal((await as(db, 'service', `UPDATE profiles SET deletion_requested_at = now() WHERE id = $1 AND deletion_requested_at IS NULL`, [TEEN])).n, 1)
    assert.equal((await as(db, 'service', `UPDATE profiles SET frozen_at = now() WHERE id = $1 AND frozen_at IS NULL`, [TEEN])).n, 0, 'times never move')
    const p = (await db.query<Record<string, unknown>>(`SELECT * FROM profiles WHERE id = $1`, [TEEN])).rows[0]
    for (const c of cols) assert.deepEqual(p[c], c === 'certifications' ? [] : null, c)
    assert.equal(p.role, 'player')
    // Deleting the auth user (the PR B job) still removes the profile.
    await db.query(`DELETE FROM players WHERE user_id = $1`, [KID])
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [KID])
    assert.equal((await db.query(`SELECT 1 FROM profiles WHERE id = $1`, [KID])).rows.length, 0)
  })
}

test('040 before 039: refuses and changes nothing', async () => {
  const { db } = await freshDb('039')
  assert.match(await tryFile(db, M040), /needs migrations 021, 037 and 039/)
  assert.equal((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'frozen_at'`)).rows.length, 0)
})

// The paste file lives next to the repo on the build box only; elsewhere this is reported as skipped.
const PASTE = join(ROOT, 'prod-sql-040-profile-freeze-marker.sql')
test('paste file is byte-identical to migration 040', { skip: !existsSync(PASTE) }, () => {
  assert.ok(readFileSync(M040).equals(readFileSync(PASTE)))
})
