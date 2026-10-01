// Builds an in-memory Postgres (PGlite) with Supabase's roles and auth/storage
// stubs, then applies supabase/migrations in order. For SQL tests only; never
// connects to a real database.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const MIGRATIONS = join(__dirname, '..', 'migrations')

// Statements in old migrations that never ran as written on Postgres and are
// unrelated to the code under test: 008's `CREATE POLICY IF NOT EXISTS` (not
// valid Postgres syntax) and 012's ALTER of a legacy timestamp_notes "text"
// column that 001 never creates. Any other failure is reported.
const KNOWN_FAILURES = [
  /^008_avatar_url\.sql: syntax error at or near "NOT"/,
  /^012_catchup\.sql: column "text" of relation "timestamp_notes"/,
]

/** Split a SQL file into statements, keeping $$ bodies and quoted strings intact. */
export function splitSql(sql: string): string[] {
  const out: string[] = []
  let cur = '', i = 0, inDollar: string | null = null, inQ = false, inLineC = false
  while (i < sql.length) {
    const c = sql[i]
    if (inLineC) { cur += c; if (c === '\n') inLineC = false; i++; continue }
    if (!inDollar && !inQ && c === '-' && sql[i + 1] === '-') { inLineC = true; cur += c; i++; continue }
    if (!inQ) {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/)
      if (m) { if (inDollar === m[0]) inDollar = null; else if (!inDollar) inDollar = m[0]; cur += m[0]; i += m[0].length; continue }
    }
    if (!inDollar && c === "'") inQ = !inQ
    if (!inDollar && !inQ && c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue }
    cur += c; i++
  }
  if (cur.replace(/--.*$/gm, '').trim()) out.push(cur.trim())
  return out.filter(s => s.replace(/--.*$/gm, '').trim())
}

export async function runFile(db: PGlite, file: string) {
  for (const stmt of splitSql(readFileSync(file, 'utf8'))) await db.exec(stmt)
}

/** Fresh database with every migration whose file name sorts before `before`. */
export async function migratedDb(before: string): Promise<{ db: PGlite; unexpected: string[] }> {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, created_at timestamptz default now());
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ select string_to_array(name,'/') $$;
    INSERT INTO storage.buckets (id, name, public) VALUES ('lessons', 'lessons', false);
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
    GRANT SELECT ON storage.objects TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
  `)
  const unexpected: string[] = []
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && f < before).sort()) {
    for (const stmt of splitSql(readFileSync(join(MIGRATIONS, f), 'utf8'))) {
      try { await db.exec(stmt) } catch (e) {
        const msg = `${f}: ${(e as Error).message}`
        if (!KNOWN_FAILURES.some(k => k.test(msg))) unexpected.push(`${msg} :: ${stmt.slice(0, 80)}`)
      }
    }
  }
  await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role`)
  return { db, unexpected }
}
