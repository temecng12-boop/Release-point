/**
 * Migrations 038 (grandfather existing players: the CEO's prod-sql-038 + prod-sql-038b,
 * both already run on prod, combined) and 039 (Terms history, Terms columns locked, grade ranges aren't ages) in
 * PGlite (in-memory; never a real database), on the prod shape (035, 036,
 * 037 applied) and on a fresh database (001-037), each run twice. Also the
 * box-only follow-up paste that clears age_screen_at on pending invites.
 * Run with: npx tsx --test supabase/tests/prod-shape/one-screen-038-039.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { prodShapeDb, freshDb, as, tryFile, u, migration } from './prod-fixture'
import { ageGroupIsPlainYouth, ageGroupIsUnder13 } from '../../../src/lib/age-band'

const M035 = migration('035_drop_legacy_policies.sql')
const M036 = migration('036_avatars_private.sql')
const M037 = migration('037_age_bands.sql')
const M038 = migration('038_grandfather_existing_players.sql')
const M039 = migration('039_terms_history_tos_lock_grade_ranges.sql')
const ROOT = join(__dirname, '..', '..', '..', '..')

async function db037(shape: 'prod' | 'fresh') {
  const { db, unexpected } = shape === 'fresh' ? await freshDb('038') : await prodShapeDb()
  assert.deepEqual(unexpected, [])
  if (shape === 'prod') {
    assert.equal(await tryFile(db, M035), '')
    assert.equal(await tryFile(db, M036), '')
    assert.equal(await tryFile(db, M037), '')
  }
  return db
}

const COACH = u(1), KID = u(3), SOLO = u(4), ADULT = u(5), FROZEN = u(6), OTHER = u(7)
const P = { invited: u(101), solo: u(102), nolan: u(103), pending: u(104), coachBand: u(105), frozen: u(106), grade: u(107), youthRange: u(108), u12: u(109), plainYouth: u(110), bareRange: u(111), gradeNoBand: u(112) }

async function seed(db: PGlite) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c@x','{"role":"coach"}'),($2,'k@x','{}'),($3,'s@x','{}'),($4,'n@x','{}'),($5,'f@x','{}'),($6,'o@x','{}') ON CONFLICT DO NOTHING`, [COACH, KID, SOLO, ADULT, FROZEN, OTHER])
  for (const [id, name, role] of [[COACH, 'Coach', 'coach'], [KID, 'Kid', 'player'], [SOLO, 'Solo', 'player'], [ADULT, 'Nolan George', 'player'], [FROZEN, 'Frozen', 'player']] as const) {
    await db.query(`INSERT INTO profiles (id, full_name, role) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, [id, name, role])
  }
  await db.query(`INSERT INTO teams (id, coach_id, name, age_group) VALUES ($1,$5,'G','9-12'),($2,$5,'Y','Youth 10-12'),($3,$5,'U','U12'),($4,$5,'B','10-12')`, [u(401), u(402), u(403), u(404), COACH])
  const ins = (id: string, coach: string | null, user: string | null, name: string, extra = '') =>
    db.query(`INSERT INTO players (id, coach_id, user_id, full_name, email${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ($1,$2,$3,$4,$5${extra ? ', ' + extra.split('=')[1] : ''})`, [id, coach, user, name, `${name.replace(/\W/g, '').toLowerCase()}@x`])
  await ins(P.invited, COACH, KID, 'Invited Kid')
  await ins(P.solo, null, SOLO, 'Solo Player')
  await ins(P.nolan, COACH, ADULT, 'Nolan George')
  await ins(P.pending, COACH, null, 'Pending Invite')
  await ins(P.coachBand, COACH, null, 'Coach Band', `age_band_coach='13_17'`)
  await ins(P.frozen, COACH, FROZEN, 'Frozen Kid', `age_band_self='under_13'`)
  await db.query(`UPDATE players SET age_screen_at = now() WHERE id = $1`, [P.frozen])
  await ins(P.grade, COACH, null, 'Grade Range', `age_band_coach='13_17'`)
  await ins(P.youthRange, COACH, null, 'Youth Range', `age_band_coach='13_17'`)
  await ins(P.u12, COACH, null, 'U Twelve', `age_band_coach='18_plus'`)
  await ins(P.plainYouth, COACH, null, 'Plain Youth', `age_group='Youth'`)
  await ins(P.bareRange, COACH, null, 'Bare Range', `age_band_coach='13_17'`)
  await ins(P.gradeNoBand, COACH, null, 'Grade No Band')
  await db.query(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$5),($2,$6),($3,$7),($4,$8),($9,$5)`, [P.grade, P.youthRange, P.u12, P.bareRange, u(401), u(402), u(403), u(404), P.gradeNoBand])
}

type Row = { age_band: string | null; source: string | null; coach: string | null; self: string | null; screened: boolean; video: boolean }
async function rows(db: PGlite): Promise<Record<string, Row>> {
  const r = await db.query<{ id: string } & Row>(`SELECT id, age_band, age_band_source source, age_band_coach coach, age_band_self self, age_screen_at IS NOT NULL screened, public.player_has_video_consent(id) video FROM players`)
  const byId = Object.fromEntries(r.rows.map(({ id, ...rest }) => [id, rest]))
  return Object.fromEntries(Object.entries(P).map(([k, id]) => [k, byId[id]]))
}

for (const shape of ['prod', 'fresh'] as const) {
  test(`${shape}: 038 (038 + 038b) applies after 037, runs twice (second run changes nothing), report works`, async () => {
    const db = await db037(shape)
    await seed(db)
    const before = await rows(db)
    assert.equal(before.grade.age_band, 'under_13', '037 reads the grade range "9-12" as under 13')
    assert.equal(before.gradeNoBand.age_band, 'under_13')
    assert.equal(before.plainYouth.age_band, 'under_13')
    assert.equal(await tryFile(db, M038), '')
    const once = await rows(db)
    const snap = async () => (await db.query(`SELECT id, age_band_coach, age_band, age_confirmed_at, age_screen_at FROM players ORDER BY id`)).rows
    const s1 = await snap()
    assert.equal(await tryFile(db, M038), '', 'runs twice')
    assert.deepEqual(await snap(), s1, 'second run changes nothing')
    // No band before -> 13_17 from the coach (18+ for names on the list), screen done, video allowed.
    assert.deepEqual(once.invited, { age_band: '13_17', source: 'coach', coach: '13_17', self: null, screened: true, video: true })
    assert.deepEqual(once.solo, { age_band: '13_17', source: 'coach', coach: '13_17', self: null, screened: true, video: true })
    assert.deepEqual(once.nolan, { age_band: '18_plus', source: 'coach', coach: '18_plus', self: null, screened: true, video: true })
    assert.deepEqual(once.pending, { age_band: '13_17', source: 'coach', coach: '13_17', self: null, screened: true, video: true })
    // Rows that already had a band keep it; 038b marks them past the age screen too.
    for (const k of ['coachBand', 'frozen', 'grade', 'youthRange', 'u12', 'plainYouth', 'gradeNoBand', 'bareRange'] as const) {
      assert.deepEqual(once[k], { ...before[k], screened: true }, k)
    }
    assert.equal(before.coachBand.screened, false)
    assert.deepEqual(Object.values(once).filter((r) => !r.screened), [], '038b: every existing player is past the age screen')
    // The report (its last statement) runs on its own.
    const report = (await db.query<{ full_name: string }>(readFileSync(M038, 'utf8').split('COMMIT;')[1])).rows
    assert.equal(report.length, 12)
  })

  test(`${shape}: 039 after 038: grade ranges aren't ages, U-numbers and Youth ranges still are; runs twice`, async () => {
    const db = await db037(shape)
    await seed(db)
    assert.equal(await tryFile(db, M038), '')
    assert.equal(await tryFile(db, M039), '')
    assert.equal(await tryFile(db, M039), '', 'runs twice')
    const r = await rows(db)
    assert.deepEqual(r.grade, { age_band: '13_17', source: 'coach', coach: '13_17', self: null, screened: true, video: true }, '"9-12" (grades): the coach band now stands')
    assert.deepEqual(r.bareRange, { age_band: '13_17', source: 'coach', coach: '13_17', self: null, screened: true, video: true }, 'bare "10-12" no longer counts')
    assert.deepEqual(r.gradeNoBand, { age_band: null, source: null, coach: null, self: null, screened: true, video: false }, 'no answers, grade team: unknown, still no video (038b marked it past the screen, so only the coach can set a band, in Edit Player)')
    assert.equal(r.youthRange.age_band, 'under_13', '"Youth 10-12" still under 13')
    assert.equal(r.youthRange.source, 'age_group')
    assert.equal(r.u12.age_band, 'under_13', 'U12 still under 13 (younger wins over the coach\'s 18+)')
    assert.equal(r.plainYouth.age_band, 'under_13', 'plain Youth, no band: still under 13')
    assert.deepEqual(r.frozen, { age_band: 'under_13', source: 'self', coach: null, self: 'under_13', screened: true, video: false }, 'a frozen account stays frozen')
    // Recompute on a team change still uses the new rule.
    await db.query(`UPDATE teams SET age_group = 'U10' WHERE id = $1`, [u(401)])
    assert.equal((await rows(db)).grade.age_band, 'under_13', 'team renamed to U10: under 13 again')
    // Read-only report
    const rep = (await db.query<{ item: string; n: number }>(readFileSync(M039, 'utf8').split("NOTIFY pgrst, 'reload schema';")[1])).rows
    assert.ok(rep.some((x) => x.item === 'triggers in place (expect 2)' && Number(x.n) === 2), JSON.stringify(rep))
    // The app's write paths after 039 (service role = server actions; coach and player = RLS).
    const C = u(9001), K = u(9003), PL = u(9101)
    await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c9@x','{"role":"coach"}'),($2,'k9@x','{}')`, [C, K])
    assert.equal((await as(db, 'service', `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'K','k9@x')`, [PL, C])).err, '', 'invite (no band)')
    assert.equal((await as(db, 'service', `UPDATE players SET user_id=$1, accepted_at=now() WHERE email='k9@x' AND user_id IS NULL`, [K])).n, 1, 'link on accept')
    assert.equal((await as(db, 'service', `UPDATE players SET age_band_self='13_17', age_screen_at=now() WHERE id=$1 AND age_screen_at IS NULL AND age_band_self IS NULL`, [PL])).n, 1, 'the one screen answer')
    assert.equal((await as(db, 'service', `UPDATE profiles SET tos_accepted_at=now(), tos_version='2026-10-03' WHERE id=$1 AND tos_accepted_at IS NULL`, [K])).n, 1, 'Terms on profiles')
    assert.equal((await as(db, 'service', `INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1,'2026-10-03')`, [K])).err, '', 'Terms history row')
    assert.equal((await as(db, C, `UPDATE players SET full_name='K L', position='pitcher' WHERE id=$1`, [PL])).n, 1, 'coach edit')
    assert.equal((await as(db, K, `UPDATE profiles SET full_name='K' WHERE id=auth.uid()`)).n, 1, 'player profile edit')
    assert.equal((await as(db, 'service', `UPDATE players SET age_band_coach='18_plus' WHERE id=$1`, [PL])).err, '', 'optional coach band in Edit Player')
    assert.equal((await db.query<{ b: string }>(`SELECT age_band b FROM players WHERE id=$1`, [PL])).rows[0].b, '13_17', 'younger answer wins')
    assert.equal((await as(db, C, `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'x')`, [u(9201), PL, C, `${PL}/x.mp4`])).err, '', 'coach clip for a 13-17 player')
  })

  test(`${shape}: 039 locks profiles.tos_accepted_at / tos_version to the app`, async () => {
    const db = await db037(shape)
    await seed(db)
    assert.equal(await tryFile(db, M039), '')
    for (const set of [`tos_accepted_at = now()`, `tos_version = '2099-01-01'`, `tos_accepted_at = NULL, tos_version = 'x'`]) {
      const r = await as(db, KID, `UPDATE profiles SET ${set} WHERE id = $1`, [KID])
      assert.match(r.err, /set by the app/, set)
    }
    assert.equal((await as(db, KID, `UPDATE profiles SET full_name = 'Kid K' WHERE id = $1`, [KID])).n, 1, 'other own-row edits still work')
    // Own-row insert with the Terms columns set is refused; a plain one still works.
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1,'new@x')`, [u(9)])
    await db.query(`DELETE FROM profiles WHERE id = $1`, [u(9)]) // the signup trigger made one; test the user's own insert
    assert.match((await as(db, u(9), `INSERT INTO profiles (id, full_name, role, tos_accepted_at, tos_version) VALUES ($1,'N','player',now(),'v')`, [u(9)])).err, /set by the app/)
    assert.equal((await as(db, u(9), `INSERT INTO profiles (id, full_name, role) VALUES ($1,'N','player')`, [u(9)])).err, '')
    // The service role (the app's signup code) can set them.
    assert.equal((await as(db, 'service', `UPDATE profiles SET tos_accepted_at = now(), tos_version = '2026-10-03' WHERE id = $1`, [KID])).n, 1)
    // Once set, the user still can't change or clear them.
    assert.match((await as(db, KID, `UPDATE profiles SET tos_accepted_at = NULL WHERE id = $1`, [KID])).err, /set by the app/)
    const v = (await db.query<{ v: string }>(`SELECT tos_version v FROM profiles WHERE id = $1`, [KID])).rows[0].v
    assert.equal(v, '2026-10-03')
  })

  test(`${shape}: 039 terms_acceptances: append-only, own rows only, service role writes, backfill, cascade`, async () => {
    const db = await db037(shape)
    await seed(db)
    // Acceptances already on profiles (037) are copied in by 039, once.
    await db.query(`UPDATE profiles SET tos_accepted_at = '2026-10-04T10:00:00Z', tos_version = '2026-10-03' WHERE id = $1`, [COACH])
    await db.query(`UPDATE profiles SET tos_accepted_at = '2026-10-04T11:00:00Z' WHERE id = $1`, [SOLO])
    assert.equal(await tryFile(db, M039), '')
    assert.equal(await tryFile(db, M039), '', 'runs twice')
    const all = async () => (await db.query<{ user_id: string; tos_version: string }>(`SELECT user_id, tos_version FROM terms_acceptances ORDER BY user_id`)).rows
    assert.deepEqual(await all(), [{ user_id: COACH, tos_version: '2026-10-03' }, { user_id: SOLO, tos_version: 'unrecorded' }], 'backfill once, no duplicates on the second run')
    // The service role appends (accepted_at defaults to now()).
    const svc = await as(db, 'service', `INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1, '2026-10-03') RETURNING accepted_at`, [KID])
    assert.equal(svc.err, ''); assert.ok(svc.rows[0].accepted_at)
    // A user sees only their own rows.
    assert.deepEqual((await as(db, KID, `SELECT user_id FROM terms_acceptances`)).rows.map((x) => x.user_id), [KID])
    assert.deepEqual((await as(db, null, `SELECT user_id FROM terms_acceptances`)).rows, [], 'anon sees nothing')
    // Users can't insert, update or delete, even their own rows.
    assert.ok((await as(db, KID, `INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1, 'x')`, [KID])).err, 'user insert refused')
    for (const sql of [`UPDATE terms_acceptances SET tos_version = 'x' WHERE user_id = $1`, `DELETE FROM terms_acceptances WHERE user_id = $1`]) {
      const r = await as(db, KID, sql, [KID])
      assert.ok(r.err || r.n === 0, sql)
    }
    assert.equal((await db.query(`SELECT 1 FROM terms_acceptances WHERE user_id = $1 AND tos_version = '2026-10-03'`, [KID])).rows.length, 1, 'row unchanged')
    // Even if a later grant gave users write access, the trigger refuses.
    await db.exec(`GRANT INSERT, UPDATE, DELETE ON public.terms_acceptances TO authenticated; CREATE POLICY tmp_all ON public.terms_acceptances FOR ALL TO authenticated USING (true) WITH CHECK (true)`)
    for (const sql of [`INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1, 'x')`, `UPDATE terms_acceptances SET tos_version = 'x' WHERE user_id = $1`, `DELETE FROM terms_acceptances WHERE user_id = $1`]) {
      assert.match((await as(db, KID, sql, [KID])).err, /written by the app only/, sql)
    }
    await db.exec(`DROP POLICY tmp_all ON public.terms_acceptances; REVOKE INSERT, UPDATE, DELETE ON public.terms_acceptances FROM authenticated`)
    // The service role can still correct or remove rows.
    assert.equal((await as(db, 'service', `UPDATE terms_acceptances SET tos_version = '2026-10-03' WHERE user_id = $1`, [SOLO])).n, 1)
    // Deleting the auth user removes their rows (ON DELETE CASCADE).
    await db.query(`DELETE FROM players WHERE user_id = $1`, [OTHER])
    await db.query(`INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1, 'v')`, [OTHER])
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [OTHER])
    assert.equal((await db.query(`SELECT 1 FROM terms_acceptances WHERE user_id = $1`, [OTHER])).rows.length, 0)
  })
}

test('SQL age_group_is_under_13 (039) matches ageGroupIsUnder13 in src/lib/age-band.ts', async () => {
  const db = await db037('fresh')
  assert.equal(await tryFile(db, M039), '')
  const cases = ['Youth 10-12', 'youth 10–12', 'Youth (9-12)', 'Youth 13-15', '10-12', '9-12', '8 to 10', '11–12', 'Grades 9-12', '9-12 Rec',
    '12U', '12 U', 'U12', 'u-12', 'U8', 'Under 12', 'under 10', '13U', 'U13', '13-15', '14-18', 'High School', 'Middle School', 'Youth', 'College',
    'Adult', '18+', '', 'Varsity 2026', '9u', '10U-12U', 'U13-U15', 'Amateur', 'Professional']
  for (const c of cases) {
    const sql = (await db.query<{ x: boolean }>(`SELECT public.age_group_is_under_13($1) x`, [c])).rows[0].x
    assert.equal(sql, ageGroupIsUnder13(c), `"${c}"`)
    const youth = (await db.query<{ x: boolean }>(`SELECT public.age_group_is_plain_youth($1) x`, [c])).rows[0].x
    assert.equal(youth, ageGroupIsPlainYouth(c), `plain youth "${c}"`)
  }
  for (const c of ['9-12', '10-12', '8 to 10', 'Grades 9-12']) assert.equal(ageGroupIsUnder13(c), false, `grade range "${c}"`)
  for (const c of ['Youth 10-12', 'U8', 'U12', '12U', 'Under 12']) assert.equal(ageGroupIsUnder13(c), true, c)
  assert.equal((await db.query<{ x: boolean }>(`SELECT public.age_group_is_under_13(NULL) x`)).rows[0].x, ageGroupIsUnder13(null))
})

test('038 matches its DO-NOT-PASTE reference copy; 039 matches its paste file (byte-identical)', () => {
  const pairs: [string, string][] = [
    [M038, join(ROOT, 'prod-sql-038-combined.reference.sql')],
    [M039, join(ROOT, 'prod-sql-039-terms-history-tos-lock-grade-ranges.sql')],
  ]
  for (const [m, paste] of pairs) {
    let pasteBytes: Buffer
    try { pasteBytes = readFileSync(paste) } catch { continue } // paste files live outside the repo (box only)
    assert.ok(readFileSync(m).equals(pasteBytes), `${paste} differs from ${m}`)
  }
  assert.match(readFileSync(M038, 'utf8').split('\n').slice(0, 3).join(' '), /prod-sql-038[\s\S]*prod-sql-038b[\s\S]*ALREADY RUN ON PROD[\s\S]*DO NOT PASTE/)
  const sql = readFileSync(M038, 'utf8')
  assert.equal(sql.match(/^COMMIT;$/gm)?.length, 1, 'one transaction')
  assert.ok(sql.indexOf('WHERE age_band IS NULL;') < sql.indexOf('UPDATE public.players SET age_screen_at = now() WHERE age_screen_at IS NULL;'), "038b's UPDATE after 038's")
  assert.ok(sql.indexOf('UPDATE public.players SET age_screen_at = now()') < sql.indexOf('COMMIT;'), 'inside the transaction')
  assert.equal(sql.split('COMMIT;')[1].trim().match(/^SELECT/gm)?.length, 1, 'one read-only report at the end')
})

// What prod actually ran: the two paste files, one after the other (box only).
const P038 = join(ROOT, 'prod-sql-038-grandfather-existing-players.sql')
const P038B = join(ROOT, 'prod-sql-038b-no-age-screen.sql')
test('prod: combined 038 leaves the same rows as prod-sql-038 then prod-sql-038b', { skip: !existsSync(P038) || !existsSync(P038B) }, async () => {
  const state = async (db: PGlite) => (await db.query(`SELECT id, age_band, age_band_source, age_band_coach, age_band_self, age_confirmed_by, age_confirmed_at IS NOT NULL c, age_screen_at IS NOT NULL s, public.player_has_video_consent(id) v FROM players ORDER BY id`)).rows
  const a = await db037('prod'); await seed(a)
  assert.equal(await tryFile(a, M038), '')
  const b = await db037('prod'); await seed(b)
  assert.equal(await tryFile(b, P038), '')
  assert.equal(await tryFile(b, P038B), '')
  assert.deepEqual(await state(a), await state(b))
})

// Follow-up paste (box only): pending invites that 038/038b marked past the screen see the one screen again.
const PENDING_Q = join(ROOT, 'pending-invites-age-screen.sql')
const RESET = join(ROOT, 'prod-sql-reset-pending-invite-age-screen.sql')
test('prod: the pending-invite query counts by coach; the reset clears only those rows, twice, and blocks nothing for active players', { skip: !existsSync(PENDING_Q) || !existsSync(RESET) }, async () => {
  const db = await db037('prod')
  await seed(db)
  assert.equal(await tryFile(db, M038), '')
  assert.equal(await tryFile(db, M039), '')
  // After 038/038b: eight pending invites (no user_id); the signed-in players are not counted.
  const query = readFileSync(PENDING_Q, 'utf8')
  const where = (f: string) => readFileSync(f, 'utf8').match(/WHERE\s+(?:p\.)?user_id IS NULL[\s\S]*?age_band_self IS NULL/)![0].replace(/p\./g, '').replace(/\s+/g, ' ')
  assert.equal(where(PENDING_Q), where(RESET), 'same WHERE clause in the query and the paste')
  const counts = (await db.query<{ coach_email: string; pending_invites_marked_past_screen: number }>(query)).rows
  assert.deepEqual(counts.map((r) => [r.coach_email, Number(r.pending_invites_marked_past_screen)]), [['c@x', 8]])
  assert.ok(counts.every((r) => Object.keys(r).length === 2), 'counts by coach email only, no player names')

  const snap = async () => (await db.query<Record<string, unknown>>(`SELECT id, user_id, age_band, age_band_coach, age_band_self, age_band_source, age_confirmed_at, age_screen_at, public.player_has_video_consent(id) video FROM players ORDER BY id`)).rows
  const before = await snap()
  assert.equal(await tryFile(db, RESET), '')
  const once = await snap()
  assert.equal(await tryFile(db, RESET), '', 'runs twice')
  assert.deepEqual(await snap(), once, 'second run changes nothing')
  for (const [i, r] of once.entries()) {
    const was = before[i]
    if (was.user_id === null && was.age_band_self === null) {
      assert.equal(r.age_screen_at, null, `pending ${String(r.id)}: sees the one screen`)
      assert.deepEqual({ ...r, age_screen_at: null }, { ...was, age_screen_at: null }, 'nothing else changes (band, video)')
    } else {
      assert.deepEqual(r, was, `signed-in or answered ${String(r.id)}: untouched`)
    }
  }
  assert.deepEqual((await db.query(query)).rows, [], 'the query now finds none')
  const report = (await db.query<Record<string, number>>(readFileSync(RESET, 'utf8').split('COMMIT;')[1])).rows[0]
  assert.equal(Number(report.pending_still_marked_expect_0), 0)
  assert.equal(Number(report.pending_will_see_one_screen), 8)
  assert.equal(Number(report.signed_in_without_screen), 0)

  // Grandfathered active players: nothing blocked. Video still allowed, own clip and coach clip writes work,
  // the one screen isn't shown to them (age_screen_at kept).
  const nolan = once.find((r) => r.id === P.nolan)!, invited = once.find((r) => r.id === P.invited)!
  assert.equal(nolan.video, true); assert.equal(invited.video, true)
  assert.ok(nolan.age_screen_at && invited.age_screen_at)
  assert.equal((await as(db, COACH, `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'x')`, [u(9301), P.nolan, COACH, `${P.nolan}/a.mp4`])).err, '', 'coach clip for an active 18+ player')
  // A player's own upload goes through createClip (service role, after the same video check).
  assert.equal((await as(db, 'service', `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'x')`, [u(9302), P.invited, KID, `${P.invited}/b.mp4`])).err, '', 'own clip for an active 13-17 player')
  assert.equal((await as(db, KID, `UPDATE profiles SET full_name = 'Kid K' WHERE id = auth.uid()`)).n, 1)

  // A pending invite accepting afterwards: links, answers the one screen once (younger wins), accepts the Terms.
  const PU = u(9401)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'pendinginvite@x','{}')`, [PU])
  assert.equal((await as(db, 'service', `UPDATE players SET user_id=$1, accepted_at=now() WHERE email='pendinginvite@x' AND user_id IS NULL`, [PU])).n, 1, 'link on accept')
  assert.equal((await as(db, 'service', `UPDATE players SET age_band_self='13_17', age_screen_at=now() WHERE id=$1 AND age_screen_at IS NULL AND age_band_self IS NULL`, [P.pending])).n, 1, 'the one screen answer is accepted')
  assert.equal((await as(db, 'service', `INSERT INTO terms_acceptances (user_id, tos_version) VALUES ($1,'2026-10-03')`, [PU])).err, '')
  const after = (await db.query<{ age_band: string; video: boolean }>(`SELECT age_band, public.player_has_video_consent(id) video FROM players WHERE id=$1`, [P.pending])).rows[0]
  assert.deepEqual(after, { age_band: '13_17', video: true })
  assert.equal((await as(db, 'service', `UPDATE players SET age_band_self='18_plus', age_screen_at=now() WHERE id=$1 AND age_screen_at IS NULL AND age_band_self IS NULL`, [P.pending])).n, 0, 'only once')

  // Guard: before 037 the paste refuses and changes nothing.
  const old = (await prodShapeDb()).db
  assert.match(await tryFile(old, RESET), /migration 037 is not applied/)
})
