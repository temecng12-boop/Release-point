// Server-side checks for the player video consent rule (RP-041).
//
// The Supabase client is passed in (the service-role client in app code) so
// these functions can be unit tested with a mocked client. Only call them from
// Server Actions, Route Handlers or Server Components.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlayersOwnCoach } from './auth/roster-access'
import { isMissingColumnError, type DbErrorLike } from './db-errors'
import {
  canUploadVideo,
  CONSENT_MIGRATION_COLUMNS,
  PLAYER_CONSENT_COLUMNS,
  UPLOAD_BLOCKED_MESSAGE,
  uploadBlockedText,
  type PlayerConsentFields,
} from './consent'

type Db = Pick<SupabaseClient, 'from'>

export type ConsentCheck = { ok: true } | { ok: false; error: string }

// ── Before migration 023 ─────────────────────────────────────────────────────
// Until 023 runs, players.adult_confirmed_at / adult_confirmed_by don't exist
// and any query naming them fails (Postgres 42703, PostgREST PGRST204). The
// code then falls back to how the app behaved before the consent rule:
// uploads are not gated, and no player counts as confirmed 18+. Once 023 is
// applied the columns exist and the rule applies; nothing else needs to change.

/** True if `error` is "column does not exist" for one of 023's columns. */
export function isMissingConsentColumn(error: DbErrorLike | null | undefined): boolean {
  return CONSENT_MIGRATION_COLUMNS.some((c) => isMissingColumnError(error, c))
}

let warned = false
function warnOnce(context: string) {
  if (warned) return
  warned = true
  console.warn(`[${context}] players.adult_confirmed_at not found: migration 023 not applied yet, so the video consent rule is off`)
}

type QueryResult = { data: unknown; error: DbErrorLike | null }

/**
 * Runs a players select with `columns` plus the consent columns. If 023's
 * columns are missing, runs it again with only `columns` plus
 * consent_given_at, and marks each row `consent_rules_pending_migration`.
 * Works for single-row and list queries.
 */
export async function selectPlayersWithConsent<T>(
  columns: string,
  run: (select: string) => PromiseLike<QueryResult>,
): Promise<{ data: T | null; error: DbErrorLike | null }> {
  const first = await run(`${columns}, ${PLAYER_CONSENT_COLUMNS}`)
  if (!isMissingConsentColumn(first.error)) return first as { data: T | null; error: DbErrorLike | null }
  warnOnce('selectPlayersWithConsent')
  const retry = await run(`${columns}, consent_given_at`)
  if (retry.error) return retry as { data: T | null; error: DbErrorLike | null }
  const mark = (row: unknown) =>
    row && typeof row === 'object'
      ? { ...(row as Record<string, unknown>), adult_confirmed_at: null, consent_rules_pending_migration: true }
      : row
  const data = Array.isArray(retry.data) ? retry.data.map(mark) : mark(retry.data)
  return { data: data as T | null, error: null }
}

/**
 * Runs a players write that includes `adultFields` (023's columns). If those
 * columns don't exist yet, runs it again without them, so signup and invites
 * still work before 023.
 */
export async function writeWithAdultFields<R extends QueryResult>(
  adultFields: Record<string, unknown>,
  run: (fields: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
  const first = await run(adultFields)
  if (Object.keys(adultFields).length === 0 || !isMissingConsentColumn(first.error)) return first
  warnOnce('writeWithAdultFields')
  return run({})
}

/**
 * Refuses media uploads for a player who is not a confirmed adult and has no
 * guardian consent on record. Fails closed if the status can't be read, except
 * before migration 023 (see above), when uploads are allowed as before.
 */
export async function checkUploadConsent(db: Db, playerId: string): Promise<ConsentCheck> {
  const { data, error } = await db
    .from('players')
    .select(PLAYER_CONSENT_COLUMNS)
    .eq('id', playerId)
    .maybeSingle()

  if (isMissingConsentColumn(error)) {
    warnOnce('checkUploadConsent')
    const { data: exists, error: existsError } = await db.from('players').select('id').eq('id', playerId).maybeSingle()
    if (existsError) return { ok: false, error: 'Could not check consent status for this player.' }
    return exists ? { ok: true } : { ok: false, error: 'Player not found' }
  }
  if (error) {
    console.error('[checkUploadConsent] could not read consent status', playerId, error.message)
    return { ok: false, error: 'Could not check consent status for this player.' }
  }
  if (!data) return { ok: false, error: 'Player not found' }
  if (!canUploadVideo(data as PlayerConsentFields)) return { ok: false, error: UPLOAD_BLOCKED_MESSAGE }
  return { ok: true }
}

/**
 * True if `userId` may change a player's 18+ status: only the player's own
 * coach. A player with no coach set cannot be changed by any coach.
 */
export async function canManagePlayerAge(db: Db, userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await db
    .from('players')
    .select('coach_id')
    .eq('id', playerId)
    .maybeSingle()
  return isPlayersOwnCoach(userId, player as { coach_id: string | null } | null)
}

/** Marks (or unmarks) a player as a confirmed adult, after an authorization check. */
export async function setAdultConfirmation(
  db: Db,
  userId: string,
  playerId: string,
  confirmed: boolean,
): Promise<{ success: true } | { error: string }> {
  if (!(await canManagePlayerAge(db, userId, playerId))) return { error: 'Not authorized' }

  const update = confirmed
    ? { adult_confirmed_at: new Date().toISOString(), adult_confirmed_by: userId }
    : { adult_confirmed_at: null, adult_confirmed_by: null }

  const { error } = await db.from('players').update(update).eq('id', playerId)
  if (isMissingConsentColumn(error)) {
    return { error: "Marking players 18+ isn't available yet: a database update still needs to be applied." }
  }
  if (error) {
    console.error('[setAdultConfirmation] update failed', { playerId, code: error.code ?? null, message: error.message })
    return { error: "Couldn't save the player's 18+ status. Please try again." }
  }
  return { success: true }
}

/**
 * The friendly "can't add video yet" error for an upload by `userId`: the
 * player's own wording (with what to do next) if they are the player, the
 * coach's otherwise.
 */
export async function uploadBlockedMessageFor(db: Db, playerId: string, userId: string): Promise<string> {
  const { data } = await db.from('players').select('user_id, coach_id, guardian_id').eq('id', playerId).maybeSingle()
  const row = data as { user_id: string | null; coach_id: string | null; guardian_id: string | null } | null
  if (row?.user_id && row.user_id === userId) return uploadBlockedText('player', { selfConfirm: !row.coach_id && !row.guardian_id })
  return uploadBlockedText('coach')
}

export const SELF_CONFIRM_FAILED = 'We couldn\'t save your confirmation. Please try again.'

/**
 * One-time 18+ confirmation by the player themself (RP-041), for a player who
 * signed up without a coach: their own row, no coach, no guardian, not yet
 * confirmed. Players with a coach are refused (their coach records age), and
 * so are players with a guardian on file (a minor whose coach left keeps
 * needing guardian consent). Success only after exactly that row was updated.
 */
export async function confirmOwnAdult(db: Db, userId: string): Promise<{ success: true } | { error: string }> {
  const { data, error } = await db
    .from('players')
    .select('id, coach_id, guardian_id, adult_confirmed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (isMissingConsentColumn(error)) return { error: "Confirming 18+ isn't available yet: a database update still needs to be applied." }
  if (error) {
    console.error('[confirmOwnAdult] read failed', { userId, message: error.message })
    return { error: SELF_CONFIRM_FAILED }
  }
  const row = data as { id: string; coach_id: string | null; guardian_id: string | null; adult_confirmed_at: string | null } | null
  if (!row) return { error: 'Player profile not found.' }
  if (row.adult_confirmed_at) return { success: true }
  if (row.coach_id) return { error: 'Your coach records your age. Ask them to mark you as 18+.' }
  if (row.guardian_id) return { error: 'A guardian is on file for your account, so video needs their consent.' }

  const { data: updated, error: updateError } = await db
    .from('players')
    .update({ adult_confirmed_at: new Date().toISOString(), adult_confirmed_by: userId })
    .eq('id', row.id)
    .eq('user_id', userId)
    .is('coach_id', null)
    .is('guardian_id', null)
    .is('adult_confirmed_at', null)
    .select('id')
  if (updateError || !Array.isArray(updated) || updated.length !== 1) {
    console.error('[confirmOwnAdult] update failed', { userId, playerId: row.id, message: updateError?.message ?? 'no row updated' })
    return { error: SELF_CONFIRM_FAILED }
  }
  return { success: true }
}
