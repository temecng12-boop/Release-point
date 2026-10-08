// Invite-only signup gate, shared by the auth callback and linkPlayerRow.
//
// Signup is invite-only: players are invited by coaches (an unlinked
// players.email row + admin generateLink type 'invite'), coaches through
// coach_invites, everyone else goes to /waitlist. The database hook
// (migration 042, Before User Created) is the primary gate; the callback
// re-checks as defense in depth.
//
// Email matching is always lower(trim(email)): a players.email can end up
// non-normalized (typed by a coach, a Supabase re-invite with different
// case, rows written before 042), so exact matching would strand real
// invitees such as lukeruba27@icloud.com.
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = Pick<SupabaseClient, 'from'>

/** The canonical invite-email form: trimmed + lowercased. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/** Escape a literal so it matches exactly inside an ILIKE pattern. */
export function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export type InviteMatch = 'player' | 'coach' | 'none'

/**
 * Which invite (if any) covers this email: an unlinked players row (no auth
 * user linked yet) or a pending coach_invites row. Matched on
 * lower(trim(email)) on both sides: the ILIKE prefilter is case-insensitive
 * (and tolerant of surrounding whitespace in old rows) and the final
 * comparison is an exact normalized equality in JS.
 */
export async function findInviteForEmail(
  db: Db,
  email: string | null | undefined,
): Promise<InviteMatch> {
  const normalized = normalizeEmail(email)
  if (!normalized) return 'none'
  const pattern = `%${ilikeLiteral(normalized)}%`

  const { data: players } = await db
    .from('players')
    .select('id, email')
    .ilike('email', pattern)
    .is('user_id', null)
    .limit(50)
  const playerRows = ((players as { id: string; email?: string | null }[] | null) ?? [])
    .filter((r) => normalizeEmail(r.email ?? null) === normalized)
  if (playerRows.length > 0) return 'player'

  const { data: invites } = await db
    .from('coach_invites')
    .select('id, email')
    .ilike('email', pattern)
    .is('accepted_at', null)
    .limit(50)
  const inviteRows = ((invites as { id: string; email?: string | null }[] | null) ?? [])
    .filter((r) => normalizeEmail(r.email ?? null) === normalized)
  if (inviteRows.length > 0) return 'coach'

  return 'none'
}

/**
 * Ids of unlinked players rows for this email (lower(trim()) match), so
 * callers can link by id instead of trusting an exact-match update.
 */
export async function findUnlinkedPlayerIds(
  db: Db,
  email: string | null | undefined,
): Promise<string[]> {
  const normalized = normalizeEmail(email)
  if (!normalized) return []
  const { data } = await db
    .from('players')
    .select('id, email')
    .ilike('email', `%${ilikeLiteral(normalized)}%`)
    .is('user_id', null)
  const rows = (data as { id: string; email?: string | null }[] | null) ?? []
  return rows
    .filter((r) => normalizeEmail(r.email ?? null) === normalized && typeof r.id === 'string')
    .map((r) => r.id)
}

/**
 * True only for an account created within `windowMs` of `nowMs` (a user
 * created by THIS request: OAuth signup, invite accept). Existing users --
 * the coaches, current players, open-beta accounts without roster rows --
 * have old created_at values and are never "brand new". Missing or
 * unparseable timestamps fail open (not new), so a clock or provider quirk
 * can never delete a real account; the hook remains the primary gate.
 */
export const INVITE_GATE_NEW_USER_WINDOW_MS = 5 * 60 * 1000

export function isBrandNewUser(
  user: { created_at?: string | null },
  nowMs: number = Date.now(),
  windowMs: number = INVITE_GATE_NEW_USER_WINDOW_MS,
): boolean {
  if (!user.created_at) return false
  const created = Date.parse(user.created_at)
  if (Number.isNaN(created)) return false
  const age = nowMs - created
  return age >= 0 && age <= windowMs
}
