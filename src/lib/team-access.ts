// Team-based coach access, checked on the server with the service client.
// Only import from Route Handlers / Server Actions.
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * True if userId is an organizer or assistant coach (team_coaches) on any team
 * the player is on. "Player's teams" = players.team_id plus player_teams rows;
 * the app links players through player_teams. Same rule as the corrected 018
 * RLS helpers.
 *
 * Fails closed: if team_coaches or player_teams can't be read (for example
 * migration 018 hasn't been applied yet), returns false and logs why.
 */
export async function isCoachOnPlayersTeam(userId: string, playerId: string, playerTeamId: string | null): Promise<boolean> {
  const teamIds = new Set<string>()
  if (playerTeamId) teamIds.add(playerTeamId)

  const { data: links, error: linksError } = await supabaseAdmin
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
  if (linksError) console.error('[team-access] player_teams lookup failed', { code: linksError.code, message: linksError.message })
  for (const l of links ?? []) teamIds.add(l.team_id as string)
  if (teamIds.size === 0) return false

  const { data: membership, error } = await supabaseAdmin
    .from('team_coaches')
    .select('team_id')
    .eq('coach_id', userId)
    .in('team_id', [...teamIds])
    .limit(1)
  if (error) {
    console.error('[team-access] team_coaches lookup failed (is migration 018 applied?)', { code: error.code, message: error.message })
    return false
  }
  return (membership ?? []).length > 0
}
