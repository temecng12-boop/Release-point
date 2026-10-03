// Prod-shaped PGlite databases for migration tests (in-memory; never a real database).
//
// prodShapeDb() models prod (project zebjt) as of 2026-10-03, after migration 034:
//   * migrations 001-033, as on a fresh database, then prod's known differences:
//   * clips.uploaded_by references public.profiles(id) ON DELETE SET NULL (not auth.users);
//   * the lessons bucket has paste 1's 4b policies (direct coach only, rls_my_direct_player_ids_text())
//     instead of 016's any-coach ones, and prod's rls_my_viewable_player_ids();
//   * 008's avatar policies exist (Postgres rejects 008 as written; prod has them);
//   * 26 legacy policies no migration creates, verbatim from the 2026-10-03 pg_policies dump
//     (prod-policies-2026-10-03.json). "profiles: own row" (the 27th) was dropped by 034.
//   * storage.objects has RLS on and Supabase's table grants.
// freshDb() is every migration before `upTo` (default: all, through 036) plus the same Supabase storage setup.
// Migrations 035 and 036 are applied by the tests on top of prodShapeDb().
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, runFile, MIGRATIONS } from '../pglite-schema'

export const PROD_POLICIES = JSON.parse(readFileSync(join(__dirname, 'prod-policies-2026-10-03.json'), 'utf8')) as {
  schemaname: string; tablename: string; policyname: string; cmd: string; permissive: string; roles: string; qual: string | null; with_check: string | null
}[]

export const LEGACY_NAMES = [
  'annotations: coach can create', 'annotations: coach can delete own', 'annotations: coach can update own', 'annotations: coach reads', 'annotations: player reads own clip annotations',
  'clips: coach can update', 'clips: coach can upload', 'clips: coach reads their players clips', 'clips: player can upload own', 'clips: player reads own clips', 'coaches update clips',
  'coaches manage metrics', 'players read metrics',
  'coaches update players', 'players: coach can update', 'players: coach reads roster', 'players: player reads own row',
  'profiles: own row', 'coaches manage own teams',
  'coach read', 'coach upload', 'player read own', 'player upload own',
  'lessons_coach_write_delete', 'lessons_coach_write_insert', 'lessons_coach_write_update', 'lessons_read_viewable_players',
]
export const AVATAR_NAMES = ['Public read avatars', 'Users can update own avatar', 'Users can upload own avatar']
export const PROD_4B_LESSONS = ['lessons_coach_insert', 'lessons_coach_select', 'lessons_coach_delete', 'lessons_player_select']

const qi = (s: string) => '"' + s.replace(/"/g, '""') + '"'
export function policySql(name: string) {
  const r = PROD_POLICIES.filter(p => p.policyname === name)
  if (r.length !== 1) throw new Error(`prod-fixture: ${name} found ${r.length}x in the dump`)
  const p = r[0]
  const roles = String(p.roles).replace(/[{}]/g, '').split(',').map(x => x.trim()).join(', ')
  return `DROP POLICY IF EXISTS ${qi(p.policyname)} ON ${p.schemaname}.${p.tablename};\n` +
    `CREATE POLICY ${qi(p.policyname)} ON ${p.schemaname}.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${roles}` +
    (p.qual ? ` USING (${p.qual})` : '') + (p.with_check ? ` WITH CHECK (${p.with_check})` : '') + ';'
}

/** Supabase storage bits the base harness lacks: RLS on storage.objects, table grants, buckets, storage.extension. */
export async function supabaseStorage(db: PGlite) {
  await db.exec(`
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
    GRANT SELECT ON storage.objects TO anon;
    GRANT ALL ON storage.objects TO service_role;
    GRANT SELECT ON storage.buckets TO authenticated, anon, service_role;
    CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT reverse(split_part(reverse(name), '.', 1)) $f$;
    GRANT EXECUTE ON FUNCTION storage.extension(text) TO authenticated, anon;
    INSERT INTO storage.buckets (id, name, public) VALUES ('clips','clips',false), ('profiles','profiles',true) ON CONFLICT (id) DO NOTHING;
  `)
}

/** Fresh database: every migration before `upTo`, plus Supabase storage setup. */
export async function freshDb(upTo = '037') {
  const { db, unexpected } = await migratedDb(upTo)
  await supabaseStorage(db)
  return { db, unexpected }
}

/** Prod as of 2026-10-03 (see the header): migrations 001-033 + prod's differences, then 034 unless
 *  `{ with034: false }` (prod before the profiles hotfix, with "profiles: own row" still there). */
export async function prodShapeDb({ with034 = true } = {}) {
  const { db, unexpected } = await migratedDb('034')
  await supabaseStorage(db)
  await db.exec(`
    ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_uploaded_by_fkey;
    ALTER TABLE public.clips ADD CONSTRAINT clips_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    CREATE OR REPLACE FUNCTION public.rls_my_direct_player_ids_text()
    RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
      SELECT p.id::text FROM public.players p WHERE p.coach_id = auth.uid() $f$;
    REVOKE ALL ON FUNCTION public.rls_my_direct_player_ids_text() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rls_my_direct_player_ids_text() TO authenticated, service_role;
    CREATE OR REPLACE FUNCTION public.rls_my_viewable_player_ids()
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
      SELECT public.rls_my_coached_player_ids()
      UNION SELECT p.id FROM public.players p WHERE p.user_id = auth.uid()
      UNION SELECT p.id FROM public.players p WHERE p.guardian_id IN (SELECT g.id FROM public.guardians g WHERE g.user_id = auth.uid()) $f$;
    REVOKE ALL ON FUNCTION public.rls_my_viewable_player_ids() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rls_my_viewable_player_ids() TO authenticated;
    DROP POLICY IF EXISTS "lessons_coach_update" ON storage.objects;
  `)
  await db.exec([...PROD_4B_LESSONS, ...AVATAR_NAMES, ...LEGACY_NAMES].map(policySql).join('\n'))
  if (with034) await runFile(db, join(MIGRATIONS, '034_profiles_role_guard.sql'))
  return { db, unexpected }
}

export type Ctx = { db: PGlite }
/** Run a statement as a user ('service' = service_role, null = anon). */
export async function as(db: PGlite, uid: string | null, sql: string, params: unknown[] = [], email?: string) {
  const sub = uid && uid !== 'service' ? uid : ''
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)`, [sub, email ?? (sub ? `${sub.slice(-3)}@x.test` : '')])
  await db.exec(uid === 'service' ? 'SET ROLE service_role' : uid ? 'SET ROLE authenticated' : 'SET ROLE anon')
  try { const r = await db.query<Record<string, unknown>>(sql, params); return { rows: r.rows, n: r.affectedRows ?? 0, err: '' } }
  catch (e) { return { rows: [] as Record<string, unknown>[], n: 0, err: (e as Error).message } }
  finally { await db.exec('RESET ROLE') }
}

/** Run a migration file; returns the error message ('' if none). Rolls back a failed transaction. */
export async function tryFile(db: PGlite, file: string) {
  try { await runFile(db, file); return '' } catch (e) { try { await db.exec('ROLLBACK') } catch { /* none open */ } return (e as Error).message }
}

export const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const migration = (name: string) => join(MIGRATIONS, name)
