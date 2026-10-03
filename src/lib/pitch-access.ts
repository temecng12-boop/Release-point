// Who may add pitch data to a clip (manual entry, CSV/PDF import, hitting
// data, and reading a TrackMan PDF for a clip). Reads with the service role;
// compares against the signed-in user's id.
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Who may add pitch rows to a clip: the direct coach of the clip's player
 * (players.coach_id) or the player themself (players.user_id). Team coaches
 * (read-only under 031), guardians and everyone else may not. The rows are
 * then written with the service role, so this check is the only gate.
 */
export async function pitchMetricWriteAccess(userId: string, clipId: string): Promise<'ok' | 'no-clip' | 'denied' | 'error'> {
  const { data: clip, error: clipError } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).maybeSingle()
  if (clipError) { console.error('[pitchMetricWriteAccess] clip lookup failed', clipId, clipError); return 'error' }
  if (!clip?.player_id) return 'no-clip'
  const { data: player, error: playerError } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', clip.player_id).maybeSingle()
  if (playerError) { console.error('[pitchMetricWriteAccess] player lookup failed', clip.player_id, playerError); return 'error' }
  if (!player) return 'no-clip'
  return player.coach_id === userId || player.user_id === userId ? 'ok' : 'denied'
}

