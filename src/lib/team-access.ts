// Team-based coach access, checked on the server with the service client.
// Only import from Route Handlers / Server Actions.
//
// The rule itself lives in src/lib/clip-access.ts (teamCoachAccess, used by
// canViewPlayerContent); this is a thin wrapper so write paths and the read
// check can't drift apart.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { canCoachWriteForPlayerWith } from '@/lib/auth/coach-write-access'
import { teamCoachAccess, type AccessDb } from '@/lib/clip-access'

/**
 * True if userId is an organizer or assistant coach (team_coaches) on any team
 * the player is on (players.team_id plus player_teams rows).
 *
 * Fails closed: if team_coaches or player_teams can't be read (for example
 * migration 018 hasn't been applied yet), returns false; clip-access logs why.
 */
export async function isCoachOnPlayersTeam(userId: string, playerId: string, playerTeamId: string | null): Promise<boolean> {
  return (await teamCoachAccess(supabaseAdmin as unknown as AccessDb, userId, playerId, playerTeamId)) === 'yes'
}

/**
 * True if `userId` is an organizer or assistant on this team.
 * Fails closed when team_coaches can't be read.
 */
export async function isCoachOnTeam(userId: string, teamId: string): Promise<boolean> {
  if (!userId || !teamId) return false
  const { data, error } = await supabaseAdmin
    .from('team_coaches')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('coach_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[team-access] team_coaches lookup failed', error.code, error.message)
    return false
  }
  return !!data
}

/**
 * Direct coach or a coach on a team that includes the player. Used by
 * roster add, later email attach, and the write helpers.
 */
export async function canCoachWriteForPlayer(userId: string, playerId: string): Promise<boolean> {
  return canCoachWriteForPlayerWith(supabaseAdmin as unknown as AccessDb, userId, playerId)
}
