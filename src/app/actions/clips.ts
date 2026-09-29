'use server'
import { describeDbError, isMissingColumnError } from '@/lib/db-errors'
import { isCoachOnPlayersTeam } from '@/lib/team-access'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendClipUploadedEmail } from '@/lib/email'
import { decideStorageAccess } from '@/lib/storage-access'

// Signed storage URLs: only for paths belonging to a player the caller may
// see (read) or write. See src/lib/storage-access.ts.
const FILE_ACCESS_DENIED = 'You don\'t have access to this file.'

async function checkStorageAccess(action: string, bucket: unknown, storagePath: unknown, mode: 'read' | 'write') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  const decision = await decideStorageAccess(supabaseAdmin, user.id, bucket, storagePath, mode)
  if (!decision.allowed) {
    console.warn(`[${action}] denied`, { userId: user.id, bucket, path: typeof storagePath === 'string' ? storagePath.slice(0, 200) : typeof storagePath, reason: decision.reason, teamCheck: decision.teamCheck })
    return { error: FILE_ACCESS_DENIED }
  }
  return { ok: true as const }
}

export async function getSignedUploadUrl(storagePath: string, bucket: 'clips' | 'lessons' = 'clips') {
  const check = await checkStorageAccess('getSignedUploadUrl', bucket, storagePath, 'write')
  if ('error' in check) return { error: check.error }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath)

  if (error || !data) return { error: error?.message ?? 'Failed to create upload URL' }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function getClipsSignedUrl(storagePath: string) {
  const check = await checkStorageAccess('getClipsSignedUrl', 'clips', storagePath, 'read')
  if ('error' in check) return { error: check.error }

  const { data, error } = await supabaseAdmin.storage
    .from('clips')
    .createSignedUrl(storagePath, 3600)

  if (error || !data) return { error: error?.message ?? 'Failed to create signed URL' }
  return { signedUrl: data.signedUrl }
}

export async function getLessonSignedUrl(lessonPath: string) {
  const check = await checkStorageAccess('getLessonSignedUrl', 'lessons', lessonPath, 'read')
  if ('error' in check) return { error: check.error }

  const { data, error } = await supabaseAdmin.storage
    .from('lessons')
    .createSignedUrl(lessonPath, 3600)

  if (error || !data) return { error: error?.message ?? 'Failed to create signed URL' }
  return { signedUrl: data.signedUrl }
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
    session_date: data.session_date,
    uploaded_by:  user.id,
  }).select('id').single()

  if (error) {
    console.log('[createClip] error:', JSON.stringify(error))
    return { error: error.message }
  }

  // Email the coach when a player uploads (fire-and-forget)
  if (newClip?.id) {
    // Auto-link player to coach if coach uploaded for a player with no coach yet
    try {
      const { data: uploaderProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (uploaderProfile?.role === 'coach') {
        const { data: playerCheck } = await supabaseAdmin
          .from('players')
          .select('coach_id')
          .eq('id', data.player_id)
          .single()

        if (playerCheck && !playerCheck.coach_id) {
          await supabaseAdmin
            .from('players')
            .update({ coach_id: user.id })
            .eq('id', data.player_id)
        }
      }
    } catch { /* non-critical */ }

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

type HittingMetrics = { ev_avg: number | null; ev_max: number | null; launch_angle_avg: number | null; barrel_rate: number | null; hard_hit_rate: number | null; sweet_spot_rate: number | null; attack_angle: number | null; bat_speed: number | null }
export async function saveHittingMetrics(clipId: string, metrics: HittingMetrics) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', clip.player_id).single()
  if (player?.coach_id !== user.id && player?.user_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('clips').update({ hitting_metrics: metrics }).eq('id', clipId)
  if (error) return { error: error.message }

  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function renameClip(clipId: string, title: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const trimmed = title.trim()
  if (!trimmed) return { error: 'Title cannot be empty' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, uploaded_by').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', clip.player_id).single()

  if (player?.coach_id !== user.id && player?.user_id !== user.id && clip.uploaded_by !== user.id) {
    return { error: 'Not authorized' }
  }

  const { error } = await supabaseAdmin.from('clips').update({ title: trimmed }).eq('id', clipId)
  if (error) return { error: error.message }

  revalidatePath(`/clips/${clipId}`)
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

  const { data: inserted, error } = await supabaseAdmin.from('annotations').insert({
    clip_id:    data.clip_id,
    created_by: user.id,
    type:       data.type,
    color:      data.color,
    points:     data.points,
    start_pt:   data.start_pt,
    end_pt:     data.end_pt,
    origin_time: data.origin_time,
  }).select('id').single()

  if (error) return { error: describeDbError('saveAnnotation', error, 'Could not save this mark.') }
  return { success: true, id: inserted.id as string }
}

export async function deleteAnnotation(annotationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: ann } = await supabaseAdmin
    .from('annotations')
    .select('created_by')
    .eq('id', annotationId)
    .single()
  if (!ann || ann.created_by !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('annotations').delete().eq('id', annotationId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function clearAnnotations(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Not found' }

  const { data: player } = await supabaseAdmin.from('players').select('coach_id').eq('id', clip.player_id).single()
  if (player?.coach_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('annotations').delete().eq('clip_id', clipId).eq('created_by', user.id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function saveTimestampNote(data: {
  clip_id: string
  time_seconds: number
  body: string
  drawing_data?: unknown[] | null
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

  // Only send drawing_data when there are drawings, so text-only notes don't
  // depend on that column (added in migration 019).
  const hasDrawing = Array.isArray(data.drawing_data) && data.drawing_data.length > 0
  const row: Record<string, unknown> = {
    clip_id: data.clip_id,
    created_by: user.id,
    time_seconds: data.time_seconds,
    body: data.body,
  }
  if (hasDrawing) row.drawing_data = data.drawing_data

  const { data: inserted, error } = await supabaseAdmin
    .from('timestamp_notes')
    .insert(row)
    .select(hasDrawing ? 'id, time_seconds, body, drawing_data' : 'id, time_seconds, body')
    .single()

  if (error) {
    if (hasDrawing && isMissingColumnError(error, 'drawing_data')) {
      console.error('[saveTimestampNote] timestamp_notes.drawing_data is missing; apply supabase/migrations/019_schema_drift_catchup.sql', error)
      return { error: 'Drawings can\'t be saved yet because the database is missing an update (timestamp_notes.drawing_data). Remove the drawings to save the note as text only, or contact support.' }
    }
    return { error: describeDbError('saveTimestampNote', error, 'Could not save this note.') }
  }
  const note = inserted as unknown as { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }
  return { success: true, note: { ...note, drawing_data: note.drawing_data ?? null } }
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

  if (error) return { error: describeDbError('deleteTimestampNote', error, 'Could not delete this note.') }
  return { success: true }
}

export async function saveLessonPath(clipId: string, lessonPath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  if (!await isCoachForPlayer(user.id, clip.player_id)) return { error: 'Not authorized' }
  const { error } = await supabaseAdmin.from('clips').update({ lesson_path: lessonPath }).eq('id', clipId)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function deleteLessonPath(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, lesson_path').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  if (!await isCoachForPlayer(user.id, clip.player_id)) return { error: 'Not authorized' }
  if (clip.lesson_path) {
    await supabaseAdmin.storage.from('lessons').remove([clip.lesson_path])
  }
  await supabaseAdmin.from('clips').update({ lesson_path: null }).eq('id', clipId)
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

async function isCoachForPlayer(userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, team_id, user_id')
    .eq('id', playerId)
    .single()
  if (!player) return false
  if (player.coach_id === userId || player.user_id === userId) return true
  if (!player.team_id) return false
  const { data: membership } = await supabaseAdmin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', player.team_id)
    .eq('coach_id', userId)
    .single()
  return !!membership
}

export async function deleteVoicePath(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, voice_path').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  if (!await isCoachForPlayer(user.id, clip.player_id)) return { error: 'Not authorized' }

  if (clip.voice_path) {
    await supabaseAdmin.storage.from('clips').remove([clip.voice_path])
  }
  await supabaseAdmin.from('clips').update({ voice_path: null }).eq('id', clipId)
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function saveVoicePath(clipId: string, voicePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  if (!await isCoachForPlayer(user.id, clip.player_id)) return { error: 'Not authorized' }

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
  extension: number | null
  vaa: number | null
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

  // extension and vaa are new columns — insert fault-tolerantly
  const baseInsert = { clip_id: clipId, created_by: user.id, ...data }
  let row: Record<string, unknown> | null = null
  let insertError: { message: string } | null = null

  const full = await supabaseAdmin
    .from('pitch_metrics')
    .insert(baseInsert)
    .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa')
    .single()

  if (full.error?.code === 'PGRST204' || full.error?.message?.includes('extension') || full.error?.message?.includes('vaa')) {
    // Columns don't exist yet — insert without them
    const { extension: _ext, vaa: _vaa, ...coreData } = baseInsert as typeof baseInsert & { extension: unknown; vaa: unknown }
    void _ext; void _vaa
    const fallback = await supabaseAdmin
      .from('pitch_metrics')
      .insert(coreData)
      .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
      .single()
    row = fallback.data as Record<string, unknown> | null
    insertError = fallback.error
  } else {
    row = full.data as Record<string, unknown> | null
    insertError = full.error
  }

  if (insertError) return { error: insertError.message }
  return { metric: row }
}

export async function saveReframe(clipId: string, reframe: { left: number; top: number; right: number; bottom: number } | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  const { data: player } = await supabaseAdmin.from('players').select('coach_id').eq('id', clip.player_id).single()
  if (player?.coach_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('clips').update({ reframe }).eq('id', clipId)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

// Coach notes on a clip. Previously written from the browser with the anon key,
// which depends on the clips/players RLS policies; those recurse (42P17
// "infinite recursion detected in policy for relation players") and the UI only
// showed "Save failed". Now checked and written on the server like the other
// clip actions, with the real error logged.
//
// Who can edit: the player's direct coach (players.coach_id), or any coach on
// one of the player's teams (organizer or assistant in team_coaches), the same
// rule as the corrected 018 RLS policies. "Player's teams" means players.team_id
// plus player_teams rows, because the app links players through player_teams.
const MAX_CLIP_NOTES_LENGTH = 20000

export async function saveClipNotes(clipId: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  if (typeof notes !== 'string') return { error: 'Invalid notes.' }
  if (notes.length > MAX_CLIP_NOTES_LENGTH) {
    return { error: `Notes are too long (max ${MAX_CLIP_NOTES_LENGTH.toLocaleString()} characters).` }
  }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', clipId)
    .maybeSingle()
  if (clipError) return { error: describeDbError('saveClipNotes:clip', clipError, 'Could not save notes.') }
  if (!clip) return { error: 'Clip not found' }

  const { data: player, error: playerError } = await supabaseAdmin
    .from('players')
    .select('coach_id, team_id')
    .eq('id', clip.player_id)
    .maybeSingle()
  if (playerError) return { error: describeDbError('saveClipNotes:player', playerError, 'Could not save notes.') }
  if (!player) return { error: 'Clip not found' }
  const allowed = player.coach_id === user.id
    || await isCoachOnPlayersTeam(user.id, clip.player_id, player.team_id as string | null)
  if (!allowed) return { error: 'Only the player\'s coaches can edit these notes.' }

  const { data: updated, error } = await supabaseAdmin
    .from('clips')
    .update({ notes })
    .eq('id', clipId)
    .select('id')
  if (error) return { error: describeDbError('saveClipNotes', error, 'Could not save notes.') }
  if (!updated || updated.length === 0) {
    console.error('[saveClipNotes] update matched no rows', { clipId })
    return { error: 'Could not save notes. Please refresh and try again.' }
  }
  return { success: true }
}
