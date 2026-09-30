// Server-side authorization helpers for player-scoped data (clips, notes,
// metrics, signed storage URLs). These are needed because most server code
// reads through the service-role client, which bypasses Postgres RLS.
//
// Only import this from Server Components, Server Actions, or Route Handlers.
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * True if `userId` may UPLOAD media for this player: only the player's own
 * coach (players.coach_id) or the player themself (players.user_id). The same
 * rule as signed upload links (src/lib/storage-access.ts); team coaches can
 * read but not upload.
 */
export async function canUploadForPlayer(userId: string, playerId: string): Promise<boolean> {
  if (!userId || !playerId) return false
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return false
  if (player.coach_id !== null && player.coach_id === userId) return true
  if (player.user_id !== null && player.user_id === userId) return true
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
