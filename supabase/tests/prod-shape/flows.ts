// Core app flows as RLS sees them (end-user role, or service_role where the app uses supabaseAdmin).
// Each returns a map flow -> 'ok' | 'FAIL <details>'. Used by flows.test.ts on prod-shaped and fresh databases.
import type { PGlite } from '@electric-sql/pglite'
import { as, u } from './prod-fixture'

export async function coreFlows(db: PGlite, base = 0) {
  const q = (s: string, p: unknown[] = []) => db.query<Record<string, unknown>>(s, p)
  const A = (uid: string | null, s: string, p: unknown[] = [], email?: string) => as(db, uid, s, p, email)
  const id = (n: number) => u(base + n)
  const res: Record<string, string> = {}
  const ok = (k: string, c: boolean, why: unknown[] = []) => { res[k] = c ? 'ok' : `FAIL ${why.map(String).join('|')}` }
  const COACH = id(1), ASST = id(2), KID = id(3), GUARD = id(6), NEWP = id(8)
  const mail = (x: string) => `${x.slice(-3)}@x.test`
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,$2,'{"role":"coach"}'),($3,$4,'{"role":"coach"}'),($5,$6,'{}'),($7,$8,'{}'),($9,$10,'{}')`,
    [COACH, mail(COACH), ASST, mail(ASST), KID, mail(KID), GUARD, mail(GUARD), NEWP, mail(NEWP)])
  const roles = (await q(`SELECT string_agg(role, ',' ORDER BY id) r FROM profiles WHERE id = ANY($1)`, [[COACH, ASST, KID, GUARD]])).rows[0]
  ok('signup: auth.users trigger creates coach/player profiles', roles.r === 'coach,coach,player,player', [roles.r])
  let r = await A('service', `INSERT INTO profiles (id, full_name, role) VALUES ($1,'C','coach') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name`, [COACH])
  ok('signup: coach signUp service-role upsert', !r.err, [r.err])
  r = await A('service', `INSERT INTO profiles (id, full_name, role) VALUES ($1,'P','player') ON CONFLICT (id) DO NOTHING`, [NEWP])
  ok('signup: linkPlayerRow service-role profile upsert (player)', !r.err, [r.err])
  r = await A(KID, `UPDATE profiles SET full_name='Kid' WHERE id=auth.uid()`); ok('profile: own name edit', !r.err && r.n === 1, [r.err, r.n])
  const P = id(101), P2 = id(102), PG = id(103)
  r = await A('service', `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid',$3)`, [P, COACH, mail(KID)]); ok('invite: service-role players insert', !r.err, [r.err])
  r = await A(COACH, `INSERT INTO players (id, coach_id, full_name, email) VALUES ($1,$2,'Kid8',$3)`, [P2, COACH, mail(NEWP)]); ok('invite: coach direct unlinked insert (032)', !r.err, [r.err])
  r = await A('service', `UPDATE players SET user_id=$1, accepted_at=now() WHERE id=$2 AND user_id IS NULL`, [KID, P])
  const r1 = await A('service', `UPDATE players SET user_id=$1, accepted_at=now() WHERE email=$2 AND user_id IS NULL`, [NEWP, mail(NEWP)])
  ok('accept: service-role link (auth/callback, linkPlayerRow)', !r.err && r.n === 1 && r1.n === 1, [r.err, r.n, r1.n])
  r = await A(COACH, `INSERT INTO guardians (id, full_name, email) VALUES ($1,'Mom',$2)`, [id(501), mail(GUARD)]); ok('guardian: coach creates guardian (guardians_coach_insert)', !r.err, [r.err])
  await q(`INSERT INTO players (id, coach_id, full_name, guardian_id) VALUES ($1,$2,'Minor',$3)`, [PG, COACH, id(501)])
  const g1 = await A('service', `UPDATE guardians SET user_id=$1 WHERE id=$2`, [GUARD, id(501)])
  const g2 = await A('service', `INSERT INTO profiles (id, full_name, role) VALUES ($1,'Mom','guardian') ON CONFLICT (id) DO NOTHING`, [GUARD])
  const g3 = await A('service', `SELECT public.promote_empty_player_to_guardian($1) x`, [GUARD])
  const g4 = await A('service', `UPDATE players SET consent_given_at=now() WHERE id=$1 AND guardian_id=$2`, [PG, id(501)])
  const gr = (await q(`SELECT role FROM profiles WHERE id=$1`, [GUARD])).rows[0]?.role
  ok('guardian consent: recordConsent path (link, promote to guardian, consent)', !g1.err && !g2.err && !g3.err && g4.n === 1 && gr === 'guardian', [g1.err, g2.err, g3.err, g4.n, gr])
  r = await A(GUARD, `SELECT count(*)::int c FROM players WHERE id=$1`, [PG]); ok('guardian: reads own child', r.rows[0]?.c === 1, [r.err])
  await q(`UPDATE players SET consent_given_at=now() WHERE id IN ($1,$2)`, [P, P2])
  const C = id(201)
  r = await A(COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${P}/${C}.mp4`]); ok('clip upload: coach storage insert (consented)', !r.err, [r.err])
  r = await A('service', `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'t')`, [C, P, COACH, `${P}/${C}.mp4`]); ok('clip insert: service role (createClip)', !r.err, [r.err])
  r = await A(COACH, `INSERT INTO clips (id, player_id, uploaded_by, storage_path, title) VALUES ($1,$2,$3,$4,'t2')`, [id(202), P, COACH, `${P}/${Date.now()}.mp4`]); ok('clip insert: coach direct, app path <player_id>/<ts>.mp4', !r.err, [r.err])
  r = await A(KID, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${P}/selfie.mp4`]); ok('clip upload: player self top-level (consented)', !r.err, [r.err])
  r = await A(COACH, `UPDATE clips SET title='t!', hitting_metrics='{}'::jsonb WHERE id=$1`, [C]); ok('clip: coach edits title / hitting metrics (user client)', !r.err && r.n === 1, [r.err, r.n])
  r = await A(COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${P}/${C}/voice.webm`]); ok('voice note: coach uploads <player>/<clip>/voice.webm', !r.err, [r.err])
  r = await A(COACH, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='clips' AND name=$1`, [`${P}/${C}.mp4`]); ok('storage: coach reads clip file', r.rows[0]?.c === 1, [r.err])
  r = await A(KID, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='clips' AND name=$1`, [`${P}/${C}.mp4`]); ok('storage: player reads own clip file', r.rows[0]?.c === 1, [r.err])
  await q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('clips',$1)`, [`${PG}/m.mp4`])
  r = await A(GUARD, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='clips' AND name=$1`, [`${PG}/m.mp4`]); ok('storage: guardian reads child clip file', r.rows[0]?.c === 1, [r.err])
  r = await A(KID, `SELECT count(*)::int c FROM clips WHERE player_id=$1`, [P]); ok('clips: player reads own clips', r.rows[0]?.c === 2, [JSON.stringify(r.rows)])
  r = await A(COACH, `SELECT * FROM save_clip_notes($1, md5(''), 'great')`, [C]); ok('notes: save_clip_notes RPC', r.rows[0]?.saved === true, [r.err, JSON.stringify(r.rows)])
  const a1 = await A(COACH, `INSERT INTO annotations (id, clip_id, created_by, type, origin_time) VALUES ($1,$2,$3,'line',1)`, [id(301), C, COACH])
  const a2 = await A(COACH, `UPDATE annotations SET color='red' WHERE id=$1`, [id(301)])
  const a3 = await A(KID, `SELECT count(*)::int c FROM annotations WHERE clip_id=$1`, [C])
  const a4 = await A(COACH, `INSERT INTO timestamp_notes (clip_id, created_by, time_seconds, body) VALUES ($1,$2,1,'x')`, [C, COACH])
  const a5 = await A(COACH, `DELETE FROM annotations WHERE id=$1`, [id(301)])
  ok('annotations + timestamp notes: coach insert/update/delete, player reads', !a1.err && a2.n === 1 && a3.rows[0]?.c === 1 && !a4.err && a5.n === 1, [a1.err, a2.n, a3.rows[0]?.c, a4.err, a5.n])
  const m1 = await A(COACH, `INSERT INTO pitch_metrics (id, clip_id, created_by, spin_axis) VALUES ($1,$2,$3,10)`, [id(601), C, COACH])
  const m2 = await A(KID, `SELECT count(*)::int c FROM pitch_metrics WHERE clip_id=$1`, [C])
  const m3 = await A(COACH, `UPDATE pitch_metrics SET velocity=88 WHERE id=$1`, [id(601)])
  const m4 = await A(COACH, `DELETE FROM pitch_metrics WHERE id=$1`, [id(601)])
  ok('metrics: coach insert/update/delete, player reads', !m1.err && m2.rows[0]?.c === 1 && m3.n === 1 && m4.n === 1, [m1.err, m2.rows[0]?.c, m3.n, m4.n])
  const LP = `${P}/${C}/lesson.webm`
  const l1 = await A('service', `INSERT INTO lessons (clip_id, player_id, coach_id, media_path) VALUES ($1,$2,$3,$4)`, [C, P, COACH, LP])
  const l2 = await A(KID, `SELECT count(*)::int c FROM lessons WHERE player_id=$1`, [P])
  const l3 = await A(COACH, `INSERT INTO storage.objects (bucket_id, name) VALUES ('lessons',$1)`, [LP])
  const l4 = await A(COACH, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [LP])
  const l5 = await A(KID, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [LP])
  ok('lessons: row (service) + player reads row; direct coach uploads/reads file; player reads file', !l1.err && l2.rows[0]?.c === 1 && !l3.err && l4.rows[0]?.c === 1 && l5.rows[0]?.c === 1, [l1.err, l2.rows[0]?.c, l3.err, l4.rows[0]?.c, l5.rows[0]?.c])
  const T = id(401)
  const t1 = await A(COACH, `INSERT INTO teams (id, coach_id, name) VALUES ($1,$2,'T')`, [T, COACH])
  await q(`INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'organizer') ON CONFLICT DO NOTHING`, [T, COACH]).catch(() => undefined)
  const t2 = await A(COACH, `INSERT INTO team_coaches (team_id, coach_id, role) VALUES ($1,$2,'assistant')`, [T, ASST])
  await q(`INSERT INTO player_teams (player_id, team_id) VALUES ($1,$2)`, [P, T]); await q(`UPDATE players SET team_id=$1 WHERE id=$2`, [T, P])
  const t3 = await A(ASST, `SELECT count(*)::int c FROM teams WHERE id=$1`, [T])
  const t4 = await A(ASST, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='clips' AND name=$1`, [`${P}/${C}.mp4`])
  const t4b = await A(ASST, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='lessons' AND name=$1`, [LP])
  const t5 = await A(COACH, `UPDATE teams SET name='T2' WHERE id=$1`, [T])
  const t6 = await A(ASST, `UPDATE teams SET name='hack' WHERE id=$1`, [T])
  const t7 = await A(COACH, `SELECT * FROM delete_team($1)`, [T])
  const left = (await q(`SELECT (SELECT count(*)::int FROM teams WHERE id=$1) t, (SELECT team_id FROM players WHERE id=$2) pt, (SELECT count(*)::int FROM players WHERE id=$2) p`, [T, P])).rows[0]
  ok('teams: owner creates + adds assistant; assistant reads team, clip and lesson files, can not edit; owner renames; delete_team keeps the player',
    !t1.err && !t2.err && t3.rows[0]?.c === 1 && t4.rows[0]?.c === 1 && t4b.rows[0]?.c === 1 && t5.n === 1 && t6.n === 0 && !t7.err && left.t === 0 && left.pt === null && left.p === 1,
    [t1.err, t2.err, t3.rows[0]?.c, t4.rows[0]?.c, t4b.rows[0]?.c, t5.n, t6.n, t7.err, JSON.stringify(left)])
  const avatar = `avatars/${KID}.png`
  const v1 = await A(KID, `INSERT INTO storage.objects (bucket_id, name) VALUES ('profiles',$1)`, [avatar])
  const v2 = await A(KID, `UPDATE storage.objects SET name=name WHERE bucket_id='profiles' AND name=$1`, [avatar])
  const v3 = await A(null, `SELECT count(*)::int c FROM storage.objects WHERE bucket_id='profiles' AND name=$1`, [avatar])
  const v4 = await A(KID, `INSERT INTO storage.objects (bucket_id, name) VALUES ('profiles',$1)`, [`avatars/${COACH}.png`])
  res.__avatars = JSON.stringify([v1.err, v2.n, v3.rows[0]?.c, v4.err])
  const avatarsOk = !v1.err && v2.n === 1 && v3.rows[0]?.c === 1 && !!v4.err
  const d0 = await A('service', `DELETE FROM players WHERE user_id=$1`, [NEWP])
  const d1 = await A('service', `DELETE FROM profiles WHERE id=$1`, [NEWP])
  let d2 = ''; try { await q(`DELETE FROM auth.users WHERE id=$1`, [NEWP]); await q(`DELETE FROM auth.users WHERE id=$1`, [ASST]) } catch (e) { d2 = (e as Error).message }
  const gone = (await q(`SELECT count(*)::int c FROM profiles WHERE id IN ($1,$2)`, [NEWP, ASST])).rows[0]
  ok('account deletion: service-role deletes + auth.users delete cascades the profile', !d0.err && !d1.err && !d2 && gone.c === 0, [d0.err, d1.err, d2, gone.c])
  return { res, avatarsOk }
}
