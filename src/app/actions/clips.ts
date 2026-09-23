'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendClipUploadedEmail } from '@/lib/email'

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

  const { data: newClip, error } = await supabaseAdmin.from('clips').insert({
    player_id:    data.player_id,
    storage_path: data.storage_path,
    title:        data.title,
    uploaded_by:  user.id,
  }).select('id').single()

  if (error) {
    console.log('[createClip] error:', JSON.stringify(error))
    return { error: error.message }
  }

  // Email the coach when a player uploads (fire-and-forget)
  if (newClip?.id) {
    try {
      const { data: player } = await supabaseAdmin
        .from('players')
        .select('coach_id, full_name')
        .eq('id', data.player_id)
        .single()
      if (player?.coach_id && player.coach_id !== user.id) {
        const { data: coachProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', player.coach_id)
          .single()
        const { data: coachUser } = await supabaseAdmin.auth.admin.getUserById(player.coach_id)
        if (coachUser?.user?.email) {
          await sendClipUploadedEmail({
            coachEmail: coachUser.user.email,
            coachName: coachProfile?.full_name ?? 'Coach',
            playerName: player.full_name,
            clipTitle: data.title,
            clipId: newClip.id,
          })
        }
      }
    } catch { /* email is non-critical */ }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function saveAnnotation(data: {
  clip_id: string
  type: string
  color: string
  points: { x: number; y: number }[] | null
  start_pt: { x: number; y: number } | null
  end_pt: { x: number; y: number } | null
  origin_time: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', data.clip_id)
    .single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .single()
  if (player?.coach_id !== user.id && player?.user_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('annotations').insert({
    clip_id:    data.clip_id,
    created_by: user.id,
    type:       data.type,
    color:      data.color,
    points:     data.points,
    start_pt:   data.start_pt,
    end_pt:     data.end_pt,
    origin_time: data.origin_time,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function saveTimestampNote(data: {
  clip_id: string
  time_seconds: number
  body: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', data.clip_id)
    .single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .single()
  if (player?.coach_id !== user.id && player?.user_id !== user.id) return { error: 'Not authorized' }

  const { data: note, error } = await supabaseAdmin
    .from('timestamp_notes')
    .insert({ clip_id: data.clip_id, created_by: user.id, time_seconds: data.time_seconds, body: data.body })
    .select('id, time_seconds, body')
    .single()

  if (error) return { error: error.message }
  return { success: true, note }
}

export async function deleteTimestampNote(noteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin
    .from('timestamp_notes')
    .delete()
    .eq('id', noteId)
    .eq('created_by', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function saveVoicePath(clipId: string, voicePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  const { data: player } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', clip.player_id).single()
  if (player?.coach_id !== user.id && player?.user_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin
    .from('clips')
    .update({ voice_path: voicePath })
    .eq('id', clipId)

  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
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

export async function savePhaseChecklist(clipId: string, checklist: {
  name: string
  rating: 'good' | 'needs_work' | 'critical' | null
  note: string
}[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', clipId)
    .single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .single()
  if (player?.coach_id !== user.id) return { error: 'Only the coach can save the mechanics checklist' }

  const { error } = await supabaseAdmin
    .from('clips')
    .update({ phase_checklist: checklist })
    .eq('id', clipId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function addPitchMetric(clipId: string, data: {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', clipId)
    .single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .single()
  if (player?.coach_id !== user.id && player?.user_id !== user.id) return { error: 'Not authorized' }

  const { data: row, error } = await supabaseAdmin
    .from('pitch_metrics')
    .insert({ clip_id: clipId, created_by: user.id, ...data })
    .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
    .single()

  if (error) return { error: error.message }
  return { metric: row }
}
