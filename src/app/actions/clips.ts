'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteClip(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the clip to get storage paths and verify access
  const { data: clip } = await supabase
    .from('clips')
    .select('id, storage_path, voice_path, uploaded_by')
    .eq('id', clipId)
    .single()

  if (!clip) return { error: 'Clip not found' }
  if (clip.uploaded_by !== user.id) {
    // Also allow coaches who own the player
    const { data: playerCheck } = await supabase
      .from('clips')
      .select('player_id')
      .eq('id', clipId)
      .single()
    if (playerCheck) {
      const { data: playerOwner } = await supabase
        .from('players')
        .select('coach_id')
        .eq('id', playerCheck.player_id)
        .single()
      if (!playerOwner || playerOwner.coach_id !== user.id) {
        return { error: 'Not authorized' }
      }
    }
  }

  // Delete related records first
  await supabase.from('annotations').delete().eq('clip_id', clipId)
  await supabase.from('timestamp_notes').delete().eq('clip_id', clipId)
  await supabase.from('pitch_metrics').delete().eq('clip_id', clipId)

  // Delete storage files
  if (clip.storage_path) {
    await supabase.storage.from('clips').remove([clip.storage_path])
  }
  if (clip.voice_path) {
    await supabase.storage.from('clips').remove([clip.voice_path])
  }

  // Delete the clip record
  const { error } = await supabase.from('clips').delete().eq('id', clipId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}
