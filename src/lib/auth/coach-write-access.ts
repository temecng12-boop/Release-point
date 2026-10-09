// Shared team-aware write check: the player's direct coach (players.coach_id)
// or a coach (organizer or assistant) on a team that includes the player.
// Kept free of the service-role client so tests can pass a fake.
import { teamCoachAccess, type AccessDb } from '../clip-access'

export type CoachWritePlayer = { coach_id: string | null; team_id: string | null }

/**
 * True if `userId` may write coach content for this player (upload, notes,
 * metrics, lessons, invite email). Not for head-coach-only actions (delete
 * player, remove from team, manage coaches, team settings).
 */
export async function canCoachWriteForPlayerWith(
  db: AccessDb,
  userId: string,
  playerId: string,
): Promise<boolean> {
  if (!userId || !playerId) return false
  const { data, error } = await db.from('players').select('coach_id, team_id').eq('id', playerId).maybeSingle()
  if (error || !data) return false
  const row = data as CoachWritePlayer
  if (row.coach_id !== null && row.coach_id === userId) return true
  return (await teamCoachAccess(db, userId, playerId, row.team_id)) === 'yes'
}
