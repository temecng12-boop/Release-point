/**
 * Migration 037 (age bands; video only for confirmed 13+ players) in PGlite
 * (in-memory; never a real database), on the prod shape (+035) and on a fresh
 * database, each with 037 applied twice.
 * Run with: npx tsx --test supabase/tests/prod-shape/age-bands-037.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { prodShapeDb, freshDb, as, tryFile, u, migration } from './prod-fixture'
import { coreFlows } from './flows'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ageGroupIsPlainYouth } from '../../../src/lib/age-band'

const M035 = migration('035_drop_legacy_policies.sql')
const M037 = migration('037_age_bands.sql')

async function db037(shape: 'prod' | 'fresh', seed?: (db: PGlite) => Promise<void>) {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('036') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') assert.equal(await tryFile(db, M035), '')
  if (seed) await seed(db)
  assert.equal(await tryFile(db, M037), '')
  assert.equal(await tryFile(db, M037), '', 'runs twice')
  return db
}

const COACH = u(1), KID = u(3), GUARD = u(6), ASST = u(2), OTHER = u(7)
async function people(db: PGlite) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c@x','{"role":"coach"}'),($2,'a@x','{"role":"coach"}'),($3,'k@x','{}'),($4,'g@x','{}'),($5,'o@x','{"role":"coach"}') ON CONFLICT DO NOTHING`, [COACH, ASST, KID, GUARD, OTHER])
  await db.query(`INSERT INTO guardians (id, full_name, email, user_id) VALUES ($1,'Mom','g@x',$2) ON CONFLICT DO NOTHING`, [u(501), GUARD])
  await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'T','High School') ON CONFLICT DO NOTHING`, [u(401), COACH])
  await db.query(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant') ON CONFLICT DO NOTHING`, [u(401), ASST])
}
const row = async (db: PGlite, id: string) => (await db.query<Record<string, unknown>>(`SELECT age_band, age_band_source, age_band_coach, age_band_self, age_confirmed_at IS NOT NULL confirmed, adult_confirmed_at IS NOT NULL adult, public.player_has_video_consent(id) video FROM players WHERE id=$1`, [id])).rows[0]

type State = { name: string; set: string; video: boolean }
const STATES: State[] = [
  { name: 'no band', set: ``, video: false },
  { name: 'guardian consent only (old one-click)', set: `consent_given_at = now()`, video: false },
  { name: 'under 13 (coach)', set: `age_band_coach = 'under_13'`, video: false },
  { name: '13 to 17 (coach)', set: `age_band_coach = '13_17'`, video: true },
  { name: '18+ (coach)', set: `age_band_coach = '18_plus'`, video: true },
  { name: '18+ coach, 13 to 17 self', set: `age_band_coach = '18_plus', age_band_self = '13_17'`, video: true },
  { name: '18+ coach, under 13 self', set: `age_band_coach = '18_plus', age_band_self = 'under_13'`, video: false },
  { name: 'old code: adult_confirmed_at only', set: `adult_confirmed_at = now(), adult_confirmed_by = '${COACH}'`, video: true },
]

for (const shape of ['prod', 'fresh'] as const) {
  test(`${shape}: video matrix (band x role) for clips rows, clips bucket and lessons bucket`, async () => {
    const db = await db037(shape)
    await people(db)
    let n = 0
    for (const s of STATES) {
      n++
      const P = u(1000 + n)
      await db.query(`INSERT INTO players (id, coach_id, user_id, full_name, guardian_id) VALUES ($1,$2,$3,$4,$5)`, [P, COACH, n === 1 ? KID : null, s.name, u(501)])
      await db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, u(401)])
      if (s.set) await db.query(`UPDATE players SET ${s.set} WHERE id=$1`, [P])
      assert.equal((await row(db, P)).video, s.video, `${s.name}: player_has_video_consent`)
      const clip = (who: string, i: number) => as(db, who, `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'x')`, [u(5000 + n * 10 + i), P, who === 'service' ? COACH : who, `${P}/${n}${i}.mp4`])
      const svc = await clip('service', 1)
      assert.equal(!svc.err, s.video, `${s.name}: service-role clip insert (${svc.err})`)
      if (!s.video) assert.match(svc.err, /video consent for this player is still pending/)
      const coach = await clip(COACH, 2)
      assert.equal(!coach.err, s.video, `${s.name}: coach clip insert (${coach.err})`)
      for (const [who, label] of [[GUARD, 'guardian'], [ASST, 'team coach'], [OTHER, 'other coach']] as const) {
        assert.ok((await clip(who, 3)).err, `${s.name}: ${label} clip insert refused`)
      }
      const obj = (who: string, bucket: string, name: string) => as(db, who, `INSERT INTO storage.objects (bucket_id, name) VALUES ($1,$2)`, [bucket, name])
      assert.equal(!(await obj(COACH, 'clips', `${P}/s${n}.mp4`)).err, s.video, `${s.name}: coach clips bucket upload`)
      assert.equal(!(await obj(COACH, 'lessons', `${P}/c/l${n}.webm`)).err, s.video, `${s.name}: coach lessons bucket upload (P6)`)
      for (const who of [GUARD, ASST, OTHER]) {
        assert.ok((await obj(who, 'clips', `${P}/g${n}.mp4`)).err, `${s.name}: ${who} clips bucket refused`)
        assert.ok((await obj(who, 'lessons', `${P}/c/g${n}.webm`)).err, `${s.name}: ${who} lessons bucket refused`)
      }
    }
  })

  test(`${shape}: who may write the age columns (P2, P3, P4)`, async () => {
    const db = await db037(shape)
    await people(db)
    const P = u(2001)
    await db.query(`INSERT INTO players (id, coach_id, user_id, full_name, email, guardian_id) VALUES ($1,$2,$3,'Kid','k@x',$4)`, [P, COACH, KID, u(501)])
    // P3: the coach can't set age, 18+ or consent directly; other edits still work.
    for (const set of [`age_band_coach='18_plus'`, `age_band='18_plus'`, `age_band_self='18_plus'`, `age_confirmed_at=now()`, `adult_confirmed_at=now()`, `age_screen_at=now()`, `consent_given_at=now()`]) {
      const r = await as(db, COACH, `UPDATE players SET ${set} WHERE id=$1`, [P])
      assert.match(r.err, /coaches cannot/, set)
    }
    assert.equal((await as(db, COACH, `UPDATE players SET full_name='Kid L' WHERE id=$1`, [P])).n, 1)
    // P3 insert: a coach-inserted row can't carry age or consent fields.
    for (const col of ['age_band_coach', 'age_band', 'age_band_self']) {
      const r = await as(db, COACH, `INSERT INTO players (id, coach_id, full_name, ${col}) VALUES ($1,$2,'x','18_plus')`, [u(2100 + col.length), COACH])
      assert.match(r.err, /set by the app/, col)
    }
    assert.match((await as(db, COACH, `INSERT INTO players (id, coach_id, full_name, consent_given_at) VALUES ($1,$2,'x',now())`, [u(2199), COACH])).err, /set by the app/)
    assert.equal((await as(db, COACH, `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'x','x@x')`, [u(2198), COACH])).err, '', 'plain coach insert (032) still works')
    // The player can't set their own band or consent.
    for (const set of [`age_band_self='18_plus'`, `age_band='18_plus'`, `consent_given_at=now()`]) {
      const r = await as(db, KID, `UPDATE players SET ${set} WHERE id=$1`, [P])
      assert.ok(r.err || r.n === 0, `player: ${set}`)
    }
    // P2: a guardian changes nothing, consent included.
    const g = await as(db, GUARD, `UPDATE players SET consent_given_at=now() WHERE id=$1`, [P], 'g@x')
    assert.ok(g.err || g.n === 0, 'guardian consent write refused')
    assert.equal((await db.query(`SELECT consent_given_at FROM players WHERE id=$1`, [P])).rows[0] && (await db.query<{ c: unknown }>(`SELECT consent_given_at c FROM players WHERE id=$1`, [P])).rows[0].c, null)
    const pol = (await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE policyname IN ('players_guardian_consent_update','guardians_coach_insert')`)).rows
    assert.deepEqual(pol, [], 'P2/P4 policies dropped')
    assert.ok((await as(db, COACH, `INSERT INTO guardians (id, full_name, email) VALUES ($1,'M','m@x')`, [u(502)])).err, 'P4: coach guardian insert refused')
    // The service role (the app's checked server actions) can.
    assert.equal((await as(db, 'service', `UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [P])).err, '')
    assert.deepEqual(await row(db, P), { age_band: '13_17', age_band_source: 'coach', age_band_coach: '13_17', age_band_self: null, confirmed: true, adult: false, video: true })
  })

  test(`${shape}: younger band wins; under-13 age groups (player or team) win; recompute on team changes`, async () => {
    const db = await db037(shape)
    await people(db)
    const P = u(3001)
    const svc = (sql: string, p: unknown[] = []) => as(db, 'service', sql, p)
    await svc(`INSERT INTO players (id, coach_id, user_id, full_name, age_band_coach) VALUES ($1,$2,$3,'Kid','18_plus')`, [P, COACH, KID])
    assert.deepEqual(await row(db, P), { age_band: '18_plus', age_band_source: 'coach', age_band_coach: '18_plus', age_band_self: null, confirmed: true, adult: true, video: true })
    await svc(`UPDATE players SET age_band_self='13_17', age_screen_at=now() WHERE id=$1`, [P])
    let r = await row(db, P)
    assert.equal(r.age_band, '13_17'); assert.equal(r.age_band_source, 'self'); assert.equal(r.adult, false, '18+ cleared to match')
    await svc(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [P])
    assert.equal((await row(db, P)).age_band_source, 'coach', 'a tie keeps the coach')
    // An under-13 team: insert into player_teams recomputes.
    await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'Y','Youth 10-12')`, [u(402), COACH])
    await svc(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, u(402)])
    r = await row(db, P)
    assert.equal(r.age_band, 'under_13'); assert.equal(r.age_band_source, 'age_group'); assert.equal(r.video, false)
    await svc(`DELETE FROM player_teams WHERE player_id=$1 AND team_id=$2`, [P, u(402)])
    assert.equal((await row(db, P)).age_band, '13_17', 'leaving the team recomputes')
    // Team age group edits recompute (coach edits their own team: an end-user write).
    await svc(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, u(401)])
    assert.equal((await as(db, COACH, `UPDATE teams SET age_group='12U' WHERE id=$1`, [u(401)])).err, '')
    assert.equal((await row(db, P)).age_band, 'under_13')
    await as(db, COACH, `UPDATE teams SET age_group='High School' WHERE id=$1`, [u(401)])
    assert.equal((await row(db, P)).age_band, '13_17')
    // The player's own age group, and no answers at all.
    const Q = u(3002)
    await svc(`INSERT INTO players (id, coach_id, full_name, age_group) VALUES ($1,$2,'Q','U12')`, [Q, COACH])
    assert.equal((await row(db, Q)).age_band, 'under_13')
    await svc(`UPDATE players SET age_group='16U' WHERE id=$1`, [Q])
    assert.equal((await row(db, Q)).age_band, null)
    // Clearing the coach answer clears the band.
    await svc(`UPDATE players SET age_band_coach=NULL, age_band_self=NULL WHERE id=$1`, [P])
    assert.deepEqual(await row(db, P), { age_band: null, age_band_source: null, age_band_coach: null, age_band_self: null, confirmed: false, adult: false, video: false })
  })
}

test('prod: backfill turns 18+ confirmations into 18+ answers; under-13 groups win; consent-only rows stay unknown', async () => {
  const ids = { coachAdult: u(4001), selfAdult: u(4002), consentOnly: u(4003), none: u(4004), adultU12: u(4005) }
  const db = await db037('prod', async (db) => {
    await people(db)
    await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'Y','10-12')`, [u(403), COACH])
    await db.query(`INSERT INTO players (id, coach_id, user_id, full_name, adult_confirmed_at, adult_confirmed_by, consent_given_at) VALUES
      ($1,$6,NULL,'a', now(), $6, NULL), ($2,NULL,$7,'b', now(), $7, NULL), ($3,$6,NULL,'c', NULL, NULL, now()), ($4,$6,NULL,'d', NULL, NULL, NULL), ($5,$6,NULL,'e', now(), $6, NULL)`,
    [ids.coachAdult, ids.selfAdult, ids.consentOnly, ids.none, ids.adultU12, COACH, KID])
    await db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [ids.adultU12, u(403)])
  })
  assert.deepEqual(await row(db, ids.coachAdult), { age_band: '18_plus', age_band_source: 'coach', age_band_coach: '18_plus', age_band_self: null, confirmed: true, adult: true, video: true })
  assert.deepEqual(await row(db, ids.selfAdult), { age_band: '18_plus', age_band_source: 'self', age_band_coach: null, age_band_self: '18_plus', confirmed: true, adult: true, video: true })
  assert.equal((await row(db, ids.consentOnly)).video, false, 'old one-click consent alone no longer allows video')
  assert.equal((await row(db, ids.consentOnly)).age_band, null)
  assert.equal((await row(db, ids.none)).age_band, null)
  assert.equal((await row(db, ids.adultU12)).age_band, 'under_13')
  assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM players WHERE age_screen_at IS NOT NULL`)).rows[0].n, 0, 'nobody skips the age screen')
})

test('037 pre-check: without 035 it stops and changes nothing', async () => {
  const { db } = await prodShapeDb()
  assert.match(await tryFile(db, M037), /needs migration 035/)
  assert.equal((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='age_band'`)).rows.length, 0)
})

test('prod + 035 with core-flow data, then 037 twice: data kept, consent-only players lose video, app write paths still work', async () => {
  const { db } = await prodShapeDb()
  assert.equal(await tryFile(db, M035), '')
  const { res: before } = await coreFlows(db)
  assert.deepEqual(Object.entries(before).filter(([k, v]) => v !== 'ok' && !k.startsWith('__')), [])
  const counts = async () => (await db.query<{ p: number; c: number }>(`SELECT (SELECT count(*)::int FROM players) p, (SELECT count(*)::int FROM clips) c`)).rows[0]
  const n0 = await counts()
  assert.equal(await tryFile(db, M037), ''); assert.equal(await tryFile(db, M037), '')
  assert.deepEqual(await counts(), n0, 'no rows lost')
  const video = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM players WHERE public.player_has_video_consent(id)`)).rows[0].n
  assert.equal(video, 0, 'core-flow players only had one-click consent: blocked until an age band is set')
  // App write paths after 037 (service role = server actions; coach = RLS).
  const C = u(9001), K = u(9003), P = u(9101)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c9@x','{"role":"coach"}'),($2,'k9@x','{}')`, [C, K])
  assert.equal((await as(db, 'service', `INSERT INTO players (id, coach_id, full_name, email, age_band_coach) VALUES ($1,$2,'K','k9@x','13_17')`, [P, C])).err, '', 'invite with the coach band')
  assert.equal((await as(db, 'service', `UPDATE players SET user_id=$1, accepted_at=now() WHERE email='k9@x' AND user_id IS NULL`, [K])).n, 1, 'link')
  assert.equal((await as(db, 'service', `UPDATE players SET age_band_self='18_plus', age_screen_at=now() WHERE id=$1 AND age_screen_at IS NULL`, [P])).n, 1, 'age screen answer')
  assert.equal((await row(db, P)).age_band, '13_17')
  assert.equal((await as(db, C, `UPDATE players SET full_name='K L', position='pitcher' WHERE id=$1`, [P])).n, 1, 'coach edit')
  assert.equal((await as(db, K, `UPDATE profiles SET full_name='K' WHERE id=auth.uid()`)).n, 1, 'player profile edit')
  assert.equal((await as(db, 'service', `UPDATE profiles SET tos_accepted_at=now() WHERE id=$1 AND tos_accepted_at IS NULL`, [K])).n, 1, 'ToS time')
  assert.equal((await as(db, C, `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'x')`, [u(9201), P, C, `${P}/x.mp4`])).err, '', 'coach clip for a 13-17 player')
})

// 037's own rule (any range with a top of 12 or less). Migration 039 narrows it
// (grade ranges don't count); one-screen-038-039.test.ts checks 039 against the app.
function ageGroupIsUnder13_037(group: string | null | undefined): boolean {
  const g = (group ?? '').toLowerCase()
  let m = g.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/)
  if (m && Number(m[2]) <= 12) return true
  m = g.match(/(?:^|[^a-z0-9])(?:u|under)\s*-?\s*(\d{1,2})(?:[^0-9]|$)/)
  if (m && Number(m[1]) <= 12) return true
  m = g.match(/(?:^|[^0-9])(\d{1,2})\s*-?\s*u(?:[^a-z]|$)/)
  return !!m && Number(m[1]) <= 12
}

test('037 SQL age_group_is_under_13: 037\'s rule (039 changes it; see one-screen-038-039.test.ts)', async () => {
  const db = await db037('fresh')
  const cases = ['Youth 10-12', '10-12', '8 to 10', '11–12', '12U', '12 U', 'U12', 'u-12', 'Under 12', '13U', 'U13', '13-15', 'High School', 'Youth', 'College', 'Adult', '18+', '', 'Varsity 2026', '9u', '14-18', 'U8', '10U-12U']
  for (const c of cases) {
    const sql = (await db.query<{ x: boolean }>(`SELECT public.age_group_is_under_13($1) x`, [c])).rows[0].x
    assert.equal(sql, ageGroupIsUnder13_037(c), `"${c}"`)
  }
  assert.equal((await db.query<{ x: boolean }>(`SELECT public.age_group_is_under_13(NULL) x`)).rows[0].x, false)
})

test('SQL age_group_is_plain_youth matches ageGroupIsPlainYouth', async () => {
  const db = await db037('fresh')
  for (const c of ['Youth', 'youth', ' Youth ', 'Youth League', 'Youth 13-14', 'Youth 10-12', 'Youthful', 'Middle School', '12U', '', 'U-Youth']) {
    const sql = (await db.query<{ x: boolean }>(`SELECT public.age_group_is_plain_youth($1) x`, [c])).rows[0].x
    assert.equal(sql, ageGroupIsPlainYouth(c), `"${c}"`)
  }
  assert.equal((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='tos_version'`)).rows.length, 1, 'profiles.tos_version')
})

for (const shape of ['prod', 'fresh'] as const) {
  test(`${shape}: plain "Youth" = under 13 only while no band is known`, async () => {
    const db = await db037(shape)
    await people(db)
    const svc = (sql: string, p: unknown[] = []) => as(db, 'service', sql, p)
    await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'Y','Youth'), ($3,$2,'Y2','Youth 13-14')`, [u(404), COACH, u(405)])
    const P = u(6001)
    await svc(`INSERT INTO players (id, coach_id, full_name) VALUES ($1,$2,'Y')`, [P, COACH])
    await svc(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, u(404)])
    assert.equal((await row(db, P)).age_band, 'under_13', 'Youth, no band')
    assert.equal((await row(db, P)).age_band_source, 'age_group')
    await svc(`UPDATE players SET age_band_coach='13_17' WHERE id=$1`, [P])
    assert.equal((await row(db, P)).age_band, '13_17', 'a known band says otherwise')
    await svc(`UPDATE players SET age_band_coach=NULL WHERE id=$1`, [P])
    assert.equal((await row(db, P)).age_band, 'under_13')
    await svc(`UPDATE players SET age_band_self='18_plus', age_screen_at=now() WHERE id=$1`, [P])
    assert.equal((await row(db, P)).age_band, '18_plus', 'the player\'s answer also says otherwise')
    const Q = u(6002)
    await svc(`INSERT INTO players (id, coach_id, full_name) VALUES ($1,$2,'Q')`, [Q, COACH])
    await svc(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [Q, u(405)])
    assert.equal((await row(db, Q)).age_band, null, '"Youth 13-14": the range says otherwise')
  })
}

const AFFECTED = readFileSync(join(__dirname, '..', '..', 'checks', '037-affected-players.sql'), 'utf8')
test('affected-players check (before 037): read-only, counts per coach match what 037 then does', async () => {
  const { db } = await prodShapeDb()
  assert.equal(await tryFile(db, M035), '')
  await people(db)
  const B = u(8)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'b@x','{"role":"coach"}')`, [B])
  await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$2,'U','10-12'), ($3,$2,'Y','Youth')`, [u(406), COACH, u(407)])
  const ins = (id: string, coach: string | null, adult: boolean, consent: boolean, team?: string) => db.query(
    `INSERT INTO players (id, coach_id, full_name, adult_confirmed_at, consent_given_at) VALUES ($1,$2,'x',$3,$4)`, [id, coach, adult ? new Date() : null, consent ? new Date() : null])
    .then(() => team ? db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [id, team]) : undefined)
  await ins(u(7001), COACH, false, true)            // old consent only -> loses
  await ins(u(7002), COACH, false, true)            // old consent only -> loses
  await ins(u(7003), COACH, true, false, u(406))    // 18+ on 10-12 -> loses
  await ins(u(7004), COACH, true, true)             // 18+ -> keeps
  await ins(u(7005), COACH, false, false, u(407))   // no band, Youth
  await ins(u(7006), B, false, false)               // no band
  await ins(u(7007), null, false, true)             // coachless, old consent only -> loses
  const snapshot = async () => JSON.stringify((await db.query(`SELECT * FROM players ORDER BY id`)).rows)
  const before = await snapshot()
  const res = await db.query<Record<string, unknown>>(AFFECTED)
  assert.equal(await snapshot(), before, 'read-only')
  const by = Object.fromEntries(res.rows.map(r => [String(r.coach_id), Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))]))
  assert.deepEqual(by[COACH], { coach_id: COACH, coach_email: 'c@x', lose_old_consent_only: 2, lose_18plus_u13_group: 1, lose_video_total: 3, no_band_already_blocked: 1, no_band_youth_or_u13: 1, keep_video: 1, players: 5 })
  assert.equal(by[B].no_band_already_blocked, 1); assert.equal(by[B].lose_video_total, 0)
  assert.equal(by['null'].lose_old_consent_only, 1); assert.equal(by['null'].coach_email, null)
  for (const r of res.rows) for (const k of Object.keys(r)) assert.doesNotMatch(k, /name/, 'no names')
  // Apply 037: exactly the counted players lose video; 7004 keeps it.
  assert.equal(await tryFile(db, M037), '')
  for (const id of [u(7001), u(7002), u(7003), u(7007)]) assert.equal((await row(db, id)).video, false, id)
  assert.equal((await row(db, u(7004))).video, true)
  assert.equal((await row(db, u(7005))).age_band, 'under_13', 'Youth, no band: under 13 from the age group after the backfill')
})
