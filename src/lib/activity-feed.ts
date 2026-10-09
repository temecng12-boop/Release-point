// Server-side activity feed: only clips the caller may see (their roster
// plus teams they coach). A playerId filter for another team's player
// returns an empty list — never another coach's clips.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { canViewPlayerContent } from '@/lib/clip-access'

export type ActivityClip = {
  id: string
  title: string
  created_at: string
  session_date: string | null
  player_id: string
}

export async function loadActivityClips(
  userId: string,
  playerIdFilter?: string | null,
): Promise<ActivityClip[]> {
  if (playerIdFilter) {
    const access = await canViewPlayerContent(supabaseAdmin, userId, playerIdFilter)
    if (!access.allowed) return []
  }

  const { data: teamCoachRows } = await supabaseAdmin
    .from('team_coaches')
    .select('team_id')
    .eq('coach_id', userId)
  const teamIds = ((teamCoachRows ?? []) as { team_id: string }[]).map((r) => r.team_id)

  const { data: links } = teamIds.length > 0
    ? await supabaseAdmin.from('player_teams').select('player_id').in('team_id', teamIds)
    : { data: [] }
  const teamPlayerIds = [...new Set(((links ?? []) as { player_id: string }[]).map((l) => l.player_id))]

  const { data: direct } = await supabaseAdmin.from('players').select('id').eq('coach_id', userId)
  const playerIds = [...new Set([...teamPlayerIds, ...((direct ?? []) as { id: string }[]).map((p) => p.id)])]
  if (playerIds.length === 0) return []

  const allowedIds = playerIdFilter
    ? playerIds.includes(playerIdFilter) ? [playerIdFilter] : []
    : playerIds
  if (allowedIds.length === 0) return []

  const { data: clips } = await supabaseAdmin
    .from('clips')
    .select('id, title, created_at, session_date, player_id')
    .in('player_id', allowedIds)
    .order('created_at', { ascending: false })

  return (clips ?? []) as ActivityClip[]
}
