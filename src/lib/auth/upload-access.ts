// Who may upload media for a player. Kept free of the service-role client so
// it can be unit tested with a mock; app code calls canUploadForPlayer in
// ./player-access.ts, which passes the service-role client.
import type { SupabaseClient } from '@supabase/supabase-js'
import { teamCoachAccess, type AccessDb } from '../clip-access'

type Db = Pick<SupabaseClient, 'from'>

/**
 * True if `userId` may upload media for this player: the player's own coach
 * (players.coach_id), a coach on a team that includes the player, or the
 * player themself (players.user_id, for their own clips).
 */
export async function canUploadForPlayerWith(db: Db, userId: string, playerId: string): Promise<boolean> {
  if (!userId || !playerId) return false
  const { data: player } = await db
    .from('players')
    .select('coach_id, user_id, team_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false
  const row = player as { coach_id: string | null; user_id: string | null; team_id: string | null }
  if (row.coach_id !== null && row.coach_id === userId) return true
  if (row.user_id !== null && row.user_id === userId) return true
  return (await teamCoachAccess(db as unknown as AccessDb, userId, playerId, row.team_id)) === 'yes'
}
