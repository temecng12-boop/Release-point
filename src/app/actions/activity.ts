'use server'

import { createClient } from '@/lib/supabase/server'
import { loadActivityClips, type ActivityClip } from '@/lib/activity-feed'

/**
 * Activity feed, including the player filter. Scoped on the server to the
 * caller's roster and teams. A playerId the caller cannot view returns an
 * empty list — never another coach's clips.
 */
export async function getActivityFeed(
  playerId?: string | null,
): Promise<{ clips: ActivityClip[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { clips: [], error: 'Not authenticated' }
  const clips = await loadActivityClips(user.id, playerId)
  return { clips }
}
