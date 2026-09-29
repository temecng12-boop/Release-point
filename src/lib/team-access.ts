// Team-based coach access, checked on the server with the service client.
// Only import from Route Handlers / Server Actions.
//
// The rule itself lives in src/lib/clip-access.ts (teamCoachAccess, used by
// canViewPlayerContent); this is a thin wrapper so write paths and the read
// check can't drift apart.
import { supabaseAdmin } from '@/lib/supabase/admin'
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
