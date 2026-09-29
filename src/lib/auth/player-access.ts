// Server-side authorization helpers for player-scoped data (clips, notes,
// metrics, signed storage URLs). These are needed because most server code
// reads through the service-role client, which bypasses Postgres RLS.
//
// Only import this from Server Components, Server Actions, or Route Handlers.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isCoachOnPlayersTeam } from '@/lib/team-access'

/**
 * True if `userId` may UPLOAD media for this player: the player's coach, the
 * player themself, a coach on one of the player's teams (the same rule as the
 * signed upload URL in src/lib/storage-access.ts), or a coach uploading for a
 * player that has no coach yet (createClip then links them).
 * NOTE: the "coach-less player" branch preserves current product behaviour and
 * is itself a takeover risk; see dev-review.md.
 */
export async function canUploadForPlayer(userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id, team_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false
  if (player.coach_id === userId || player.user_id === userId) return true
  if (await isCoachOnPlayersTeam(userId, playerId, (player.team_id as string | null) ?? null)) return true
  if (player.coach_id === null) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    return profile?.role === 'coach'
  }
  return false
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Extracts the player id from a clips-bucket storage path of the form
 * `<playerId>/...`. Returns null for anything else (including `..` segments).
 */
export function playerIdFromStoragePath(path: string): string | null {
  if (!path || path.includes('..') || path.startsWith('/')) return null
  const first = path.split('/')[0]
  return UUID_RE.test(first) && path.split('/').length >= 2 ? first : null
}
