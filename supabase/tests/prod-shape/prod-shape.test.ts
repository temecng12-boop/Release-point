/**
 * Migrations 034 (profiles role guard) and 035 (legacy policies, lessons set,
 * clip paths) against a prod-shaped database and a fresh one, in PGlite
 * (in-memory; never a real database). See prod-fixture.ts for prod's shape.
 * Run with: npx tsx --test supabase/tests/prod-shape/prod-shape.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { prodShapeDb, freshDb, as, tryFile, u, migration, PROD_POLICIES, LEGACY_NAMES, AVATAR_NAMES, PROD_4B_LESSONS } from './prod-fixture'
import { coreFlows } from './flows'

const M034 = migration('034_profiles_role_guard.sql')
const M035 = migration('035_drop_legacy_policies.sql')
const EXPECTED = readFileSync(join(__dirname, 'expected-policies.txt'), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t').slice(0, 2).join('\t')).sort()
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ')
const policyKeys = async (db: PGlite) => (await db.query<{ k: string }>(`SELECT schemaname||'.'||tablename||E'\t'||policyname k FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1`)).rows.map(r => r.k).sort()
const policy = async (db: PGlite, name: string) => (await db.query<Record<string, unknown>>(`SELECT cmd, array_to_string(roles, ',') roles, qual, with_check FROM pg_policies WHERE policyname=$1`, [name])).rows

test('prod shape matches the 2026-10-03 dump: 26 legacy + 4b lessons + avatar policies verbatim, no "profiles: own row" after 034', async () => {
  const { db, unexpected } = await prodShapeDb()
  assert.deepEqual(unexpected, [])
  for (const n of [...LEGACY_NAMES.filter(n => n !== 'profiles: own row'), ...PROD_4B_LESSONS, ...AVATAR_NAMES]) {
    const want = PROD_POLICIES.find(p => p.policyname === n)!
    const got = await policy(db, n)
    assert.equal(got.length, 1, n)
    assert.equal(got[0].cmd, want.cmd, n); assert.equal(got[0].roles, String(want.roles).replace(/[{}]/g, ''), n)
    assert.equal(norm(got[0].qual), norm(want.qual), n); assert.equal(norm(got[0].with_check), norm(want.with_check), n)
  }
  assert.equal((await policy(db, 'profiles: own row')).length, 0)
  const fk = (await db.query<Record<string, unknown>>(`SELECT confrelid::regclass::text t, confdeltype d FROM pg_constraint WHERE conname='clips_uploaded_by_fkey'`)).rows[0]
  assert.deepEqual(fk, { t: 'profiles', d: 'n' })
})

test('034: before it, "profiles: own row" lets a player delete + re-insert their profile as coach/guardian; after it, blocked; signup paths unchanged', async () => {
  const { db } = await prodShapeDb({ with034: false })
  const K = u(3), C = u(1)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'k@x','{}'),($2,'c@x','{"role":"coach"}')`, [K, C])
  assert.equal((await as(db, K, `DELETE FROM profiles WHERE id=auth.uid()`)).n, 1)
  assert.equal((await as(db, K, `INSERT INTO profiles (id, role) VALUES (auth.uid(),'guardian')`)).err, '')
  assert.equal((await as(db, K, `UPDATE profiles SET role='coach' WHERE id=auth.uid()`)).err, 'profiles.role cannot be changed by the user')
  await db.query(`UPDATE profiles SET role='player' WHERE id=$1`, [K])
  assert.equal(await tryFile(db, M034), ''); assert.equal(await tryFile(db, M034), '')
  assert.equal((await policy(db, 'profiles: own row')).length, 0)
  const del = await as(db, K, `DELETE FROM profiles WHERE id=auth.uid()`); assert.equal(del.n, 0)
  assert.match((await as(db, K, `INSERT INTO profiles (id, role) VALUES (auth.uid(),'coach')`)).err, /primary key|duplicate|only be set to player|row-level/)
  assert.equal((await as(db, K, `UPDATE profiles SET full_name='K' WHERE id=auth.uid()`)).n, 1)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'n@x','{"role":"coach"}')`, [u(9)])
  assert.equal((await db.query<{ role: string }>(`SELECT role FROM profiles WHERE id=$1`, [u(9)])).rows[0].role, 'coach')
  await db.query(`DELETE FROM profiles WHERE id=$1`, [u(9)])  // superuser path (definer / RI cascade) still works
  assert.match((await as(db, u(9), `INSERT INTO profiles (id, role) VALUES (auth.uid(),'coach')`)).err, /only be set to player/)
  assert.equal((await as(db, u(9), `INSERT INTO profiles (id, role) VALUES (auth.uid(),'player')`)).err, '')
  assert.equal((await as(db, 'service', `UPDATE profiles SET role='coach' WHERE id=$1`, [u(9)])).err, '')
  await db.query(`DELETE FROM auth.users WHERE id=$1`, [u(9)])
  assert.equal((await db.query(`SELECT 1 FROM profiles WHERE id=$1`, [u(9)])).rows.length, 0)
})

async function exploits(db: PGlite) {
  const q = (s: string, p: unknown[] = []) => db.query(s, p)
  const A = u(11), B = u(12), K = u(13), KB = u(14), NC = u(15), TA = u(16)
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'a@x','{"role":"coach"}'),($2,'b@x','{"role":"coach"}'),($3,'k@x','{}'),($4,'kb@x','{}'),($5,'nc@x','{}'),($6,'ta@x','{"role":"coach"}')`, [A, B, K, KB, NC, TA])
  const PA = u(111), PB = u(112), PN = u(113)
  await q(`INSERT INTO players (id, coach_id, user_id, full_name, consent_given_at) VALUES ($1,$2,$3,'a',now()),($4,$5,$6,'b',now()),($7,$2,$8,'nc',NULL)`, [PA, A, K, PB, B, KB, PN, NC])
  const CA = u(211), CB = u(212)
  await q(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'a'),($5,$6,$7,$8,'b')`, [CA, PA, A, `${PA}/a.mp4`, CB, PB, B, `${PB}/b.mp4`])
  const T = u(411)
  await q(`INSERT INTO teams (id, coach_id, name) VALUES ($1,$2,'T')`, [T, A]); await q(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant')`, [T, TA]); await q(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [PA, T])
  await q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [`${PA}/c/l0.webm`])
  const ok = async (uid: string, sql: string, p: unknown[] = []) => { const r = await as(db, uid, sql, p); return !r.err && (r.n > 0 || /^\s*insert/i.test(sql)) }
  const x: Record<string, boolean> = {}
  x['metrics: coach A adds a metric on coach B\'s clip (coaches manage metrics)'] = await ok(A, `INSERT INTO pitch_metrics (clip_id, created_by) VALUES ($1,$2)`, [CB, A])
  x['metrics: a player adds a metric on another coach\'s clip'] = await ok(K, `INSERT INTO pitch_metrics (clip_id, created_by) VALUES ($1,$2)`, [CB, K])
  x['annotations: coach A moves own annotation onto B\'s clip (no CHECK)'] = await (async () => { await q(`INSERT INTO annotations (id, clip_id, created_by, type, origin_time) VALUES ($1,$2,$3,'line',0)`, [u(301), CA, A]); return ok(A, `UPDATE annotations SET clip_id=$1 WHERE id=$2`, [CB, u(301)]) })()
  x['annotations: team assistant moves own annotation onto a read-only team clip (no CHECK)'] = await (async () => {
    await q(`INSERT INTO players (id, coach_id, full_name, consent_given_at) VALUES ($1,$2,'t',now())`, [u(114), TA])
    await q(`INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'t')`, [u(214), u(114), TA, `${u(114)}/t.mp4`])
    await q(`INSERT INTO annotations (id, clip_id, created_by, type, origin_time) VALUES ($1,$2,$3,'line',0)`, [u(302), u(214), TA])
    return ok(TA, `UPDATE annotations SET clip_id=$1 WHERE id=$2`, [CA, u(302)])
  })()
  x['metrics: team assistant moves own metric onto a read-only team clip (FOR ALL, no CHECK)'] = await (async () => {
    await q(`INSERT INTO pitch_metrics (id, clip_id, created_by) VALUES ($1,$2,$3)`, [u(602), u(214), TA])
    return ok(TA, `UPDATE pitch_metrics SET clip_id=$1 WHERE id=$2`, [CA, u(602)])
  })()
  x['clips: player inserts a clip row pointing at another player\'s file'] = await ok(K, `INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,'x')`, [PA, K, `${PB}/b.mp4`])
  x['clips: direct coach inserts a clip row with another player\'s file path'] = await ok(A, `INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,'x')`, [PA, A, `${PB}/b.mp4`])
  x['clips: direct coach repoints own clip at another player\'s file'] = await ok(A, `UPDATE clips SET storage_path=$1 WHERE id=$2`, [`${PB}/b.mp4`, CA])
  x['storage: coach uploads a clip for an unconsented player ("coach upload")'] = await ok(A, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${PN}/v.mp4`])
  x['storage: unconsented player uploads own clip ("player upload own")'] = await ok(NC, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${PN}/s.mp4`])
  x['storage: player uploads below the top level ("player upload own")'] = await ok(K, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${PA}/x/voice.webm`])
  x['lessons: team assistant uploads a lesson file'] = await ok(TA, `INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [`${PA}/c/l.webm`])
  x['lessons: team assistant updates a lesson file'] = await ok(TA, `UPDATE storage.objects SET name=name WHERE bucket_id='lessons' AND name=$1`, [`${PA}/c/l0.webm`])
  x['lessons: team assistant deletes a lesson file'] = await ok(TA, `DELETE FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [`${PA}/c/l0.webm`])
  return x
}

test('035 on the prod shape: runs twice, drops every legacy policy, leaves exactly expected-policies.txt, blocks every legacy exploit, core flows unchanged', async () => {
  const before = await prodShapeDb()
  const fb = await coreFlows(before.db)
  for (const [k, v] of Object.entries(fb.res)) if (k !== '__avatars') assert.equal(v, 'ok', `before 035: ${k}`)
  assert.ok(fb.avatarsOk, `before 035: avatars ${fb.res.__avatars}`)
  const xb = await exploits(before.db)
  for (const k of ['metrics: coach A adds a metric on coach B\'s clip (coaches manage metrics)', 'metrics: a player adds a metric on another coach\'s clip', 'clips: player inserts a clip row pointing at another player\'s file',
    'clips: direct coach inserts a clip row with another player\'s file path', 'clips: direct coach repoints own clip at another player\'s file', 'storage: coach uploads a clip for an unconsented player ("coach upload")',
    'storage: unconsented player uploads own clip ("player upload own")', 'storage: player uploads below the top level ("player upload own")', 'lessons: team assistant uploads a lesson file', 'lessons: team assistant updates a lesson file', 'lessons: team assistant deletes a lesson file'])
    assert.ok(xb[k], `possible before 035: ${k}`)
  assert.ok(xb['metrics: team assistant moves own metric onto a read-only team clip (FOR ALL, no CHECK)'])
  // "annotations: coach can update own" has no WITH CHECK, but Postgres also checks an UPDATE's new row against the
  // SELECT policies, so moving an annotation onto a clip the coach can't see is refused even before 035.
  assert.equal(xb['annotations: coach A moves own annotation onto B\'s clip (no CHECK)'], false)
  assert.equal(xb['annotations: team assistant moves own annotation onto a read-only team clip (no CHECK)'], false)

  const { db } = await prodShapeDb()
  assert.equal(await tryFile(db, M035), ''); assert.equal(await tryFile(db, M035), '')
  const left = (await db.query(`SELECT policyname FROM pg_policies WHERE policyname = ANY($1)`, [LEGACY_NAMES.concat('players: coach can invite')])).rows
  assert.deepEqual(left, [])
  assert.deepEqual(await policyKeys(db), EXPECTED)
  const fa = await coreFlows(db)
  for (const [k, v] of Object.entries(fa.res)) if (k !== '__avatars') assert.equal(v, 'ok', `after 035: ${k}`)
  assert.ok(fa.avatarsOk, `after 035: avatars ${fa.res.__avatars}`)
  const xa = await exploits(db)
  for (const [k, v] of Object.entries(xa)) assert.equal(v, false, `blocked after 035: ${k}`)
})

test('035 pre-checks: missing replacement policy or missing 034 -> error, nothing changed', async () => {
  const a = await prodShapeDb()
  await a.db.exec(`DROP POLICY "teams_owner_delete" ON public.teams`)
  assert.match(await tryFile(a.db, M035), /replacement policies missing \(public\.teams teams_owner_delete\)\. Nothing was changed/)
  assert.equal((await a.db.query(`SELECT 1 FROM pg_policies WHERE policyname = ANY($1)`, [LEGACY_NAMES])).rows.length, 26)
  const b = await prodShapeDb({ with034: false })
  assert.match(await tryFile(b.db, M035), /needs migration 034/)
  assert.equal((await b.db.query(`SELECT 1 FROM pg_policies WHERE policyname = ANY($1)`, [LEGACY_NAMES])).rows.length, 27)
})

async function lessonsMatrix(db: PGlite) {
  const q = (s: string, p: unknown[] = []) => db.query(s, p)
  const D = u(21), TA = u(22), OC = u(23), K = u(24), G = u(25), KO = u(26)
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'d@x','{"role":"coach"}'),($2,'ta@x','{"role":"coach"}'),($3,'oc@x','{"role":"coach"}'),($4,'k@x','{}'),($5,'g@x','{}'),($6,'ko@x','{}')`, [D, TA, OC, K, G, KO])
  await q(`INSERT INTO guardians (id, user_id, email) VALUES ($1,$2,'g@x')`, [u(521), G])
  const P = u(121), PO = u(122)
  await q(`INSERT INTO players (id, coach_id, user_id, full_name, guardian_id, consent_given_at) VALUES ($1,$2,$3,'k',$4,now()),($5,$6,$7,'ko',NULL,now())`, [P, D, K, u(521), PO, OC, KO])
  const T = u(421); await q(`INSERT INTO teams (id, coach_id, name) VALUES ($1,$2,'T')`, [T, D]); await q(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant')`, [T, TA]); await q(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, T])
  await q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1),('lessons',$2)`, [`${P}/c/a.webm`, `${PO}/c/o.webm`])
  const sel = async (uid: string, name: string) => ((await as(db, uid, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [name])).rows[0]?.c ?? 0) === 1
  const ins = async (uid: string, name: string) => !(await as(db, uid, `INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [name])).err
  const upd = async (uid: string, name: string) => (await as(db, uid, `UPDATE storage.objects SET name=name WHERE bucket_id='lessons' AND name=$1`, [name])).n === 1
  const del = async (uid: string, name: string) => (await as(db, uid, `DELETE FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [name])).n === 1
  const own = `${P}/c/a.webm`
  return {
    'direct coach: read': await sel(D, own), 'direct coach: upload': await ins(D, `${P}/c/d.webm`), 'direct coach: delete': await del(D, `${P}/c/d.webm`),
    'direct coach: update (no update policy)': await upd(D, own), 'direct coach: read another coach\'s player': await sel(D, `${PO}/c/o.webm`),
    'team assistant: read': await sel(TA, own), 'team assistant: upload': await ins(TA, `${P}/c/t.webm`), 'team assistant: update': await upd(TA, own), 'team assistant: delete': await del(TA, own),
    'player: read own': await sel(K, own), 'player: upload': await ins(K, `${P}/c/k.webm`), 'player: read another player\'s': await sel(K, `${PO}/c/o.webm`),
    'guardian: read child\'s (app uses signed URLs)': await sel(G, own), 'other coach: read': await sel(OC, own), 'other coach: upload': await ins(OC, `${P}/c/x.webm`),
  }
}
const LESSONS_WANT = {
  'direct coach: read': true, 'direct coach: upload': true, 'direct coach: delete': true, 'direct coach: update (no update policy)': false, 'direct coach: read another coach\'s player': false,
  'team assistant: read': true, 'team assistant: upload': false, 'team assistant: update': false, 'team assistant: delete': false,
  'player: read own': true, 'player: upload': false, 'player: read another player\'s': false,
  'guardian: read child\'s (app uses signed URLs)': false, 'other coach: read': false, 'other coach: upload': false,
}
const LESSONS_SET = ['lessons_coach_delete', 'lessons_coach_insert', 'lessons_coach_select', 'lessons_player_select', 'lessons_team_coach_select']

for (const shape of ['fresh', 'prod'] as const) {
  test(`lessons storage after 035 (${shape} database): exactly one set, prod's 4b definitions, team coach read-only`, async () => {
    const { db, unexpected } = shape === 'fresh' ? await freshDb('036') : await prodShapeDb()
    assert.deepEqual(unexpected, [])
    if (shape === 'prod') { assert.equal(await tryFile(db, M035), ''); assert.equal(await tryFile(db, M035), '') }
    const names = (await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE schemaname='storage' AND (qual LIKE '%lessons%' OR with_check LIKE '%lessons%') ORDER BY 1`)).rows.map(r => r.policyname)
    assert.deepEqual(names, LESSONS_SET)
    for (const n of PROD_4B_LESSONS) {
      const want = PROD_POLICIES.find(p => p.policyname === n)!, got = (await policy(db, n))[0]
      assert.equal(norm(got.qual), norm(want.qual), n); assert.equal(norm(got.with_check), norm(want.with_check), n)
    }
    const fn = (await db.query<Record<string, unknown>>(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname='rls_my_direct_player_ids_text'`)).rows
    assert.equal(fn.length, 1); assert.equal(fn[0].prosecdef, true); assert.deepEqual(fn[0].proconfig, ['search_path=public, pg_temp'])
    assert.deepEqual(await lessonsMatrix(db), LESSONS_WANT)
  })
}

test('fresh database (001-035): migrations apply, policy set = expected-policies.txt minus 008\'s avatar policies, core flows pass', async () => {
  const { db, unexpected } = await freshDb('036')
  assert.deepEqual(unexpected, [])
  assert.deepEqual(await policyKeys(db), EXPECTED.filter(k => !AVATAR_NAMES.some(a => k.endsWith('\t' + a))))
  assert.equal(await tryFile(db, M035), '')  // re-run on fresh
  const f = await coreFlows(db)
  for (const [k, v] of Object.entries(f.res)) if (k !== '__avatars') assert.equal(v, 'ok', `fresh: ${k}`)
  assert.equal(f.avatarsOk, false, 'fresh DB has no avatar policies (008 is invalid Postgres); prod has them')
  const x = await exploits(db)
  for (const [k, v] of Object.entries(x)) assert.equal(v, false, `fresh: ${k}`)
})

test('clip storage_path rule: app paths pass, foreign paths fail; read-only check finds non-compliant rows', async () => {
  const { db } = await prodShapeDb()
  assert.equal(await tryFile(db, M035), '')
  const C = u(31), P = u(131), PO = u(132)
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,'c@x','{"role":"coach"}')`, [C])
  await db.query(`INSERT INTO players (id, coach_id, full_name, consent_given_at) VALUES ($1,$2,'p',now()),($3,$2,'p2',now())`, [P, C, PO])
  for (const path of [`${P}/${Date.now()}.mp4`, `${P}/${Date.now()}-abc123.mov`])
    assert.equal((await as(db, C, `INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,'t')`, [P, C, path])).err, '', path)
  for (const path of [`${PO}/x.mp4`, `x/${P}/a.mp4`, `${P}`, `${P}x/a.mp4`])
    assert.match((await as(db, C, `INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,'t')`, [P, C, path])).err, /row-level security/, path)
  // moving a clip to another of the coach's players without moving its file is refused too
  const id = (await db.query<{ id: string }>(`SELECT id FROM clips WHERE player_id=$1 LIMIT 1`, [P])).rows[0].id
  assert.match((await as(db, C, `UPDATE clips SET player_id=$1 WHERE id=$2`, [PO, id])).err, /row-level security/)
  // an existing non-compliant row (written by the service role) is listed by the read-only check
  await db.query(`INSERT INTO clips (player_id, uploaded_by, storage_path, title) VALUES ($1,$2,'legacy/old.mp4','old')`, [P, C])
  const bad = (await db.query(`SELECT id, player_id, storage_path FROM public.clips WHERE storage_path IS NULL OR NOT starts_with(storage_path, player_id::text || '/')`)).rows
  assert.equal(bad.length, 1)
})
