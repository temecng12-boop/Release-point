// Who may upload media for a player. Kept free of the service-role client so
// it can be unit tested with a mock; app code calls canUploadForPlayer in
// ./player-access.ts, which passes the service-role client.
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = Pick<SupabaseClient, 'from'>

/**
 * True if `userId` may upload media for this player: only the player's own
 * coach (players.coach_id) or the player themself (players.user_id, for their
 * own clips). A player with no coach can be uploaded for only by themself.
 */
export async function canUploadForPlayerWith(db: Db, userId: string, playerId: string): Promise<boolean> {
  if (!userId || !playerId) return false
  const { data: player } = await db
    .from('players')
    .select('coach_id, user_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false
  const row = player as { coach_id: string | null; user_id: string | null }
  if (row.coach_id !== null && row.coach_id === userId) return true
  if (row.user_id !== null && row.user_id === userId) return true
  return false
}
