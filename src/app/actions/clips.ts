'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function getSignedUploadUrl(storagePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabaseAdmin.storage
    .from('clips')
    .createSignedUploadUrl(storagePath)

  if (error || !data) return { error: error?.message ?? 'Failed to create upload URL' }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function createClip(data: {
  player_id: string
  storage_path: string
  title: string
  session_date: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin.from('clips').insert({
    player_id:    data.player_id,
    storage_path: data.storage_path,
    title:        data.title,
    uploaded_by:  user.id,
  })

  if (error) {
    console.log('[createClip] error:', JSON.stringify(error))
    return { error: error.message }
  }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteClip(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('id, storage_path, voice_path, uploaded_by, player_id')
    .eq('id', clipId)
    .single()

  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id')
    .eq('id', clip.player_id)
    .single()

  if (clip.uploaded_by !== user.id && player?.coach_id !== user.id) {
    return { error: 'Not authorized' }
  }

  await supabaseAdmin.from('annotations').delete().eq('clip_id', clipId)
  await supabaseAdmin.from('timestamp_notes').delete().eq('clip_id', clipId)
  await supabaseAdmin.from('pitch_metrics').delete().eq('clip_id', clipId)

  if (clip.storage_path) {
    await supabase.storage.from('clips').remove([clip.storage_path])
  }
  if (clip.voice_path) {
    await supabase.storage.from('clips').remove([clip.voice_path])
  }

  const { error } = await supabaseAdmin.from('clips').delete().eq('id', clipId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}
