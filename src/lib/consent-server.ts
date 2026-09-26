// Server-side checks for the player video consent rule (RP-041).
//
// The Supabase client is passed in (the service-role client in app code) so
// these functions can be unit tested with a mocked client. Only call them from
// Server Actions, Route Handlers or Server Components.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canUploadVideo,
  PLAYER_CONSENT_COLUMNS,
  UPLOAD_BLOCKED_MESSAGE,
  type PlayerConsentFields,
} from './consent'

type Db = Pick<SupabaseClient, 'from'>

export type ConsentCheck = { ok: true } | { ok: false; error: string }

/**
 * Refuses media uploads for a player who is not a confirmed adult and has no
 * guardian consent on record. Fails closed if the status can't be read.
 */
export async function checkUploadConsent(db: Db, playerId: string): Promise<ConsentCheck> {
  const { data, error } = await db
    .from('players')
    .select(PLAYER_CONSENT_COLUMNS)
    .eq('id', playerId)
    .maybeSingle()

  if (error) {
    console.error('[checkUploadConsent] could not read consent status', playerId, error.message)
    return { ok: false, error: 'Could not check consent status for this player.' }
  }
  if (!data) return { ok: false, error: 'Player not found' }
  if (!canUploadVideo(data as PlayerConsentFields)) return { ok: false, error: UPLOAD_BLOCKED_MESSAGE }
  return { ok: true }
}

/**
 * True if `userId` may change a player's 18+ status: the player's coach, or,
 * for a player with no coach set, the coach who owns a team the player is on
 * (the same roster rule the dashboard uses).
 */
export async function canManagePlayerAge(db: Db, userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await db
    .from('players')
    .select('coach_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false

  const coachId = (player as { coach_id: string | null }).coach_id
  if (coachId) return coachId === userId

  const { data: links } = await db
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
  const teamIds = ((links ?? []) as { team_id: string }[]).map((l) => l.team_id)
  if (teamIds.length === 0) return false

  const { data: ownedTeams } = await db
    .from('teams')
    .select('id')
    .eq('coach_id', userId)
    .in('id', teamIds)
    .limit(1)
  return ((ownedTeams ?? []) as unknown[]).length > 0
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
  if (error) return { error: error.message }
  return { success: true }
}
