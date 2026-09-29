// Server-side authorization helpers for player-scoped data (clips, notes,
// metrics, signed storage URLs). These are needed because most server code
// reads through the service-role client, which bypasses Postgres RLS.
//
// Only import this from Server Components, Server Actions, or Route Handlers.
import { supabaseAdmin } from '@/lib/supabase/admin'

export type PlayerAccessRow = {
  id?: string
  coach_id: string | null
  user_id: string | null
  guardian_id?: string | null
}

/**
 * True if `userId` may VIEW data belonging to this player:
 *  - the player's coach (players.coach_id)
 *  - the player themself (players.user_id)
 *  - a guardian linked to the player (players.guardian_id -> guardians.user_id)
 * Future: upstream's team coaches (team_coaches) would be added here.
 */
export async function canViewPlayer(userId: string, player: PlayerAccessRow | null | undefined): Promise<boolean> {
  if (!player) return false
  if (player.coach_id && player.coach_id === userId) return true
  if (player.user_id && player.user_id === userId) return true
  if (player.guardian_id) {
    const { data: guardian } = await supabaseAdmin
      .from('guardians')
      .select('id')
      .eq('id', player.guardian_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (guardian) return true
  }
  return false
}

/**
 * True if `userId` may UPLOAD media for this player. Mirrors the existing
 * createClip behaviour: the player's coach, the player themself, or a coach
 * uploading for a player that has no coach yet (createClip then links them).
 * NOTE: the "coach-less player" branch preserves current product behaviour and
 * is itself a takeover risk; see dev-review.md.
 */
export async function canUploadForPlayer(userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false
  if (player.coach_id === userId || player.user_id === userId) return true
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
