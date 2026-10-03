// Server-side authorization helpers for player-scoped data (clips, notes,
// metrics, signed storage URLs). These are needed because most server code
// reads through the service-role client, which bypasses Postgres RLS.
//
// Only import this from Server Components, Server Actions, or Route Handlers.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { canUploadForPlayerWith } from './upload-access'

/**
 * True if `userId` may UPLOAD media for this player: only the player's own
 * coach or the player themself. See ./upload-access.ts.
 */
export async function canUploadForPlayer(userId: string, playerId: string): Promise<boolean> {
  return canUploadForPlayerWith(supabaseAdmin, userId, playerId)
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
