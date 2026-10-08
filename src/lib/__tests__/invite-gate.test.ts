/**
 * Invite-only signup gate (migration 042 + src/lib/invite-gate.ts):
 * - email matching is lower(trim()) on both sides (mixed case, whitespace);
 * - the callback rejection fires only for brand-new users, never for
 *   existing users (coaches, players, open-beta accounts without roster rows);
 * - the callback deletes the stray auth user + profile, signs out, and sends
 *   the user to /waitlist?reason=invite_only, whose page shows a note;
 * - the Before User Created hook + handle_new_user change are in migration 042.
 * Run with: npx tsx --test src/lib/__tests__/invite-gate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  findInviteForEmail,
  findUnlinkedPlayerIds,
  ilikeLiteral,
  INVITE_GATE_NEW_USER_WINDOW_MS,
  isBrandNewUser,
  normalizeEmail,
} from '../invite-gate'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

// ── Minimal chainable Supabase mock (ilike + is + limit, like PostgREST) ──
type Rows = Record<string, unknown>[]
function likeMatch(value: string, pattern: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    if (c === '%') { re += '.*'; continue }
    if (c === '_') { re += '.'; continue }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i').test(value)
}
function mockDb(tables: Record<string, Rows>) {
  const queries: { table: string; pattern?: string; nullCol?: string }[] = []
  const db = {
    from(table: string) {
      const q: { table: string; pattern?: string; nullCol?: string } = { table }
      queries.push(q)
      const chain = {
        select() { return chain },
        ilike(_col: string, pattern: string) { q.pattern = pattern; return chain },
        is(col: string, v: unknown) { if (v === null) q.nullCol = col; return chain },
        limit() { return chain },
        then<T>(ok?: ((v: { data: Rows; error: null }) => T | PromiseLike<T>) | null) {
          const rows = (tables[table] ?? []).filter((r) =>
            (q.pattern === undefined || likeMatch(String(r.email ?? ''), q.pattern)) &&
            (q.nullCol === undefined || (r[q.nullCol] ?? null) === null))
          return Promise.resolve({ data: rows, error: null }).then(ok)
        },
      }
      return chain
    },
  }
  return { db: db as unknown as Parameters<typeof findInviteForEmail>[0], queries }
}

// ── normalizeEmail / ilikeLiteral ──
test('normalizeEmail trims and lowercases; empty stays empty', () => {
  assert.equal(normalizeEmail('  LukeRuba27@iCloud.COM '), 'lukeruba27@icloud.com')
  assert.equal(normalizeEmail(null), '')
  assert.equal(normalizeEmail(undefined), '')
})

test('ilikeLiteral escapes LIKE metacharacters so the match stays exact', () => {
  assert.equal(ilikeLiteral('a%b_c\\d@example.com'), 'a\\%b\\_c\\\\d@example.com')
  assert.ok(likeMatch('a%b_c\\d@example.com', ilikeLiteral('a%b_c\\d@example.com')))
  assert.ok(!likeMatch('axbxcxdx@example.com', ilikeLiteral('a%b_c\\d@example.com')))
})

// ── findInviteForEmail ──
test('an unlinked players row matches case-insensitively (Luke re-invite case)', async () => {
  const { db } = mockDb({
    players: [{ id: 'p1', email: 'Coach Typed Luke@Example.com ', user_id: null }],
    coach_invites: [],
  })
  // The stored row is mixed-case here on purpose; the real DB normalizes on
  // write (042 trigger), and matching is lower(trim()) either way.
  assert.equal(await findInviteForEmail(db, 'luke@example.com'), 'none', 'different local part: no match')
  const { db: db2 } = mockDb({
    players: [{ id: 'p1', email: 'Luke@Example.com', user_id: null }],
    coach_invites: [],
  })
  assert.equal(await findInviteForEmail(db2, '  LUKE@example.COM '), 'player')
})

test('a linked players row is not an invite (already claimed)', async () => {
  const { db } = mockDb({
    players: [{ id: 'p1', email: 'kid@example.com', user_id: 'u-kid' }],
    coach_invites: [],
  })
  assert.equal(await findInviteForEmail(db, 'kid@example.com'), 'none')
})

test('a pending coach_invites row matches; an accepted one does not', async () => {
  const pending = mockDb({
    players: [],
    coach_invites: [{ id: 'i1', email: 'coach@example.com', accepted_at: null }],
  })
  assert.equal(await findInviteForEmail(pending.db, 'Coach@Example.com'), 'coach')
  const accepted = mockDb({
    players: [],
    coach_invites: [{ id: 'i1', email: 'coach@example.com', accepted_at: '2026-10-01T00:00:00Z' }],
  })
  assert.equal(await findInviteForEmail(accepted.db, 'coach@example.com'), 'none')
})

test('a stranger matches nothing; empty email matches nothing', async () => {
  const { db } = mockDb({
    players: [{ id: 'p1', email: 'kid@example.com', user_id: null }],
    coach_invites: [{ id: 'i1', email: 'coach@example.com', accepted_at: null }],
  })
  assert.equal(await findInviteForEmail(db, 'stranger@example.com'), 'none')
  assert.equal(await findInviteForEmail(db, ''), 'none')
  assert.equal(await findInviteForEmail(db, null), 'none')
})

// ── findUnlinkedPlayerIds ──
test('findUnlinkedPlayerIds links by id across case/whitespace differences', async () => {
  const { db } = mockDb({
    players: [
      { id: 'p1', email: '  LukeRuba27@iCloud.com', user_id: null },
      { id: 'p2', email: 'other@example.com', user_id: null },
      { id: 'p3', email: 'lukeruba27@icloud.com', user_id: 'u-old' },
    ],
  })
  assert.deepEqual(await findUnlinkedPlayerIds(db, 'lukeruba27@icloud.com'), ['p1'])
})

// ── isBrandNewUser ──
const NOW = Date.parse('2026-10-07T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

test('brand new: created seconds ago; existing: created days ago', () => {
  assert.equal(isBrandNewUser({ created_at: iso(NOW - 10_000) }, NOW), true)
  assert.equal(isBrandNewUser({ created_at: iso(NOW - INVITE_GATE_NEW_USER_WINDOW_MS - 1_000) }, NOW), false)
  assert.equal(isBrandNewUser({ created_at: iso(NOW - 30 * 86_400_000) }, NOW), false,
    'an open-beta account without a roster row (e.g. cadenduke@tracylc.net) is never brand new')
})

test('missing, null, or unparseable created_at fails open (never rejects)', () => {
  assert.equal(isBrandNewUser({}, NOW), false)
  assert.equal(isBrandNewUser({ created_at: null }, NOW), false)
  assert.equal(isBrandNewUser({ created_at: 'not-a-date' }, NOW), false)
  assert.equal(isBrandNewUser({ created_at: iso(NOW + 60_000) }, NOW), false, 'clock skew fails open')
})

// ── Wiring: the callback really enforces this ──
test('auth callback: brand-new users without an invite are deleted, signed out, sent to /waitlist?reason=invite_only', () => {
  const route = read('app/auth/callback/route.ts')
  assert.match(route, /isBrandNewUser\(user\)/, 'only brand-new accounts are checked')
  assert.match(route, /findInviteForEmail\(supabaseAdmin, user\.email\)/, 'the invite lookup runs before any linking')
  assert.match(route, /rejectStrayUser\(supabaseAdmin, \(\) => supabase\.auth\.signOut\(\{ scope: 'local' \}\)/, 'the stray is deleted and signed out (this device, QA-012)')
  assert.match(route, /\/waitlist\?reason=invite_only/, 'rejected users land on the waitlist with the reason')
  assert.match(route, /finishInviteAcceptance\(supabaseAdmin, user\)/, 'acceptance is shared with /auth/confirm')
  assert.match(route, /fragmentFallbackHtml\(next,/, 'old fragment links get the client fallback')
})

test('auth callback: the coach-invite accept path still runs for invited coaches', () => {
  const route = read('app/auth/callback/route.ts')
  assert.match(route, /finishInviteAcceptance\(supabaseAdmin, user\)/, 'acceptance (link + notify + coach upgrade) runs')
  assert.match(read('lib/invite-accept.ts'), /await acceptCoachInvite\(db, user\)/, 'invited coaches are still upgraded to coach')
})

test('waitlist page shows a friendly invite-only note for ?reason=invite_only', () => {
  const page = read('app/waitlist/page.tsx')
  assert.match(page, /reason === 'invite_only'/, 'the reason is read')
  assert.match(page, /role="status"/, 'the note is announced')
  assert.match(page, /invite-only/i, 'the note says invite-only')
})

test('migration 042: Before User Created hook with the documented grants', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/042_invite_only_signup_hook.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.before_user_created_invite_check\(event jsonb\)/, 'the hook function')
  assert.match(sql, /SECURITY DEFINER/, 'runs as its owner, past RLS (supabase_auth_admin has no table access)')
  assert.match(sql, /ALTER FUNCTION public\.before_user_created_invite_check\(jsonb\) OWNER TO postgres/, 'owner is postgres')
  assert.match(sql, /user_id IS NULL/, 'players rows must be unlinked')
  assert.match(sql, /accepted_at IS NULL/, 'coach invites must be pending')
  assert.match(sql, /lower\(btrim\(email\)\)/, 'matching is lower(trim())')
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.before_user_created_invite_check\(jsonb\) TO supabase_auth_admin/, 'execute for supabase_auth_admin')
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.before_user_created_invite_check\(jsonb\) FROM PUBLIC, anon, authenticated/, 'revoked from anon, authenticated, public')
  assert.match(sql, /GRANT USAGE ON SCHEMA public TO supabase_auth_admin/, 'schema usage for supabase_auth_admin')
  assert.match(sql, /'http_code', 403/, 'rejections carry an HTTP code')
})

test('migration 042: handle_new_user always writes player, ignoring signup metadata', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/042_invite_only_signup_hook.sql', import.meta.url), 'utf8')
  const fn = sql.slice(sql.indexOf('public.handle_new_user()'))
  assert.match(fn, /'player'/, 'new profiles are players')
  assert.doesNotMatch(fn, />>'role'/, 'no role is read from user metadata')
})

test('migration 042: invite emails are normalized on write', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/042_invite_only_signup_hook.sql', import.meta.url), 'utf8')
  assert.match(sql, /players_normalize_email/, 'players trigger')
  assert.match(sql, /coach_invites_normalize_email/, 'coach_invites trigger')
  assert.match(sql, /lower\(btrim\(NEW\.email\)\)/, 'lower + trim on write')
})

test('email-link login never creates users', () => {
  assert.match(read('lib/email-link.ts'), /shouldCreateUser: false/, 'creation is off')
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

test('prod paste is migration 042 verbatim (same statements, same order)', () => {
  const migration = readFileSync(new URL('../../../supabase/migrations/042_invite_only_signup_hook.sql', import.meta.url), 'utf8')
  const paste = readFileSync(new URL('../../../prod-sql-042-invite-only-signup-hook.sql', import.meta.url), 'utf8')
  assert.match(paste, /Authentication > Hooks > Before User Created/, 'the header keeps the dashboard step')
  assert.deepEqual(sqlStatements(paste), sqlStatements(migration))
})
