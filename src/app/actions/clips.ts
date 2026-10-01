'use server'
import { describeDbError, isMissingColumnError } from '@/lib/db-errors'
import { normalizeClipNotes, isStaleClipNotesWrite, CLIP_NOTES_CONFLICT_ERROR } from '@/lib/clip-notes'
import { isCoachOnPlayersTeam } from '@/lib/team-access'
import { degreesToClock } from '@/lib/spin-axis'
import { isLessonPathFor } from '@/lib/lesson-path'
import { isVoicePathFor, timestampVoicePathFor } from '@/lib/voice-path'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendClipUploadedEmail } from '@/lib/email'
import { decideStorageAccess } from '@/lib/storage-access'
import { canUploadForPlayer, playerIdFromStoragePath } from '@/lib/auth/player-access'
import { canDeleteClip, canDeleteClipItem, isPlayersOwnCoach } from '@/lib/auth/roster-access'
import { clipFilesToRemove } from '@/lib/clip-storage'
import { removeClipMediaAsOwnCoach } from '@/lib/clip-media-delete'

// Loads the coach and account ids of the player a clip belongs to.
async function playerForClip(clipId: string) {
  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).maybeSingle()
  if (!clip?.player_id) return null
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .maybeSingle()
  return (player as { coach_id: string | null; user_id: string | null } | null) ?? null
}

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

  // The caller must be allowed to upload for this player, and the storage path
  // must live under that player's folder (prevents pointing a clip at another
  // player's video).
  if (!(await canUploadForPlayer(user.id, data.player_id))) return { error: 'Not authorized' }
  if (playerIdFromStoragePath(data.storage_path) !== data.player_id) return { error: 'Invalid storage path' }

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

  // The author may delete it only while they are still the player's current
  // coach, or are the player themself.
  const { data: ann } = await supabaseAdmin
    .from('annotations')
    .select('created_by, clip_id')
    .eq('id', annotationId)
    .maybeSingle()
  if (!ann) return { error: 'Not authorized' }
  const player = await playerForClip(ann.clip_id as string)
  if (!canDeleteClipItem(user.id, ann.created_by as string | null, player)) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('annotations').delete().eq('id', annotationId)
  if (error) return { error: error.message }
  return { success: true }
}

// Pitch rows (QA-017). Deletes run with the signed-in user's own Supabase
// client, so RLS decides: pitch_metrics_coach_all (002) only matches clips of
// players whose players.coach_id is the caller, i.e. the player's direct
// coach. Team coaches and players have no delete policy on pitch_metrics, and
// RLS then deletes 0 rows without an error, so the row count is checked and 0
// is reported as an error. The screen only drops what the database removed.
const PITCH_DELETE_DENIED = 'Pitch not deleted. Only the player\'s own coach can delete pitches. Refresh the page and try again.'

export async function deletePitchMetric(metricId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof metricId !== 'string' || !metricId) return { error: 'Pitch not found' }

  const { data: removed, error } = await supabase.from('pitch_metrics').delete().eq('id', metricId).select('id, clip_id')
  if (error) return { error: describeDbError('deletePitchMetric', error, 'Could not delete this pitch.') }
  const rows = (removed ?? []) as { id: string; clip_id: string }[]
  if (rows.length !== 1) return { error: PITCH_DELETE_DENIED }
  revalidatePath(`/clips/${rows[0].clip_id}`)
  return { success: true }
}

export async function deleteAllPitchMetrics(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof clipId !== 'string' || !clipId) return { error: 'Clip not found' }

  const { data: removed, error } = await supabase.from('pitch_metrics').delete().eq('clip_id', clipId).select('id')
  if (error) return { error: describeDbError('deleteAllPitchMetrics', error, 'Could not delete these pitches.') }
  const removedIds = ((removed ?? []) as { id: string }[]).map(r => r.id)
  if (removedIds.length === 0) return { error: PITCH_DELETE_DENIED }
  revalidatePath(`/clips/${clipId}`)
  return { success: true, removedIds }
}

// Hitting data (clips.hitting_metrics, 017): one saved summary per clip, so
// "a row" is one saved metric and "delete all" clears the summary. Same rule
// as pitch rows: only the player's direct coach. clips_coach_all (018) also
// lets team coaches update clips, so the direct-coach check is done here
// first; players have no update policy on clips. The update runs with the
// user's own client and must report the one clip row it changed.
const HITTING_DELETE_DENIED = 'Hitting data not deleted. Only the player\'s own coach can delete it. Refresh the page and try again.'
const HITTING_KEYS = ['ev_avg', 'ev_max', 'launch_angle_avg', 'barrel_rate', 'hard_hit_rate', 'sweet_spot_rate', 'attack_angle', 'bat_speed'] as const
type HittingKey = (typeof HITTING_KEYS)[number]

async function hittingDeleteContext(clipId: unknown) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  if (typeof clipId !== 'string' || !clipId) return { error: 'Clip not found' as const }
  const { data: clip, error: clipError } = await supabase.from('clips').select('player_id, hitting_metrics').eq('id', clipId).maybeSingle()
  if (clipError) return { error: describeDbError('deleteHittingMetric:clip', clipError, 'Could not delete hitting data.') }
  if (!clip) return { error: HITTING_DELETE_DENIED }
  const { data: player, error: playerError } = await supabase.from('players').select('coach_id').eq('id', (clip as { player_id: string }).player_id).maybeSingle()
  if (playerError) return { error: describeDbError('deleteHittingMetric:player', playerError, 'Could not delete hitting data.') }
  if (!isPlayersOwnCoach(user.id, player as { coach_id: string | null } | null)) return { error: HITTING_DELETE_DENIED }
  const current = ((clip as { hitting_metrics?: Record<string, number | null> | null }).hitting_metrics ?? null)
  return { supabase, current }
}

async function writeHittingMetrics(supabase: Awaited<ReturnType<typeof createClient>>, clipId: string, next: Record<string, number | null> | null, action: string) {
  const { data: changed, error } = await supabase.from('clips').update({ hitting_metrics: next }).eq('id', clipId).select('id')
  if (error) return { error: describeDbError(action, error, 'Could not delete hitting data.') }
  if (((changed ?? []) as unknown[]).length !== 1) return { error: HITTING_DELETE_DENIED }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function deleteHittingMetric(clipId: string, key: HittingKey) {
  if (!(HITTING_KEYS as readonly string[]).includes(key)) return { error: 'Unknown hitting metric' }
  const ctx = await hittingDeleteContext(clipId)
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.current?.[key] == null) return { error: 'This value was already removed. Refresh the page.' }
  const next = { ...ctx.current, [key]: null }
  const empty = HITTING_KEYS.every(k => next[k] == null)
  return writeHittingMetrics(ctx.supabase, clipId, empty ? null : next, 'deleteHittingMetric')
}

export async function deleteAllHittingMetrics(clipId: string) {
  const ctx = await hittingDeleteContext(clipId)
  if ('error' in ctx) return { error: ctx.error }
  if (!ctx.current || HITTING_KEYS.every(k => ctx.current?.[k] == null)) return { error: 'There is no saved hitting data to delete. Refresh the page.' }
  return writeHittingMetrics(ctx.supabase, clipId, null, 'deleteAllHittingMetrics')
}

export async function clearAnnotations(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Not found' }

  const { data: player } = await supabaseAdmin.from('players').select('coach_id').eq('id', clip.player_id).single()
  if (player?.coach_id !== user.id) return { error: 'Not authorized' }

  // Only this coach's own marks are deleted; the ids tell the player which
  // marks to take off the screen (src/lib/mark-clear.ts).
  const { data: removed, error } = await supabaseAdmin.from('annotations').delete().eq('clip_id', clipId).eq('created_by', user.id).select('id')
  if (error) return { error: error.message }
  return { success: true, removedIds: (removed ?? []).map(r => r.id as string) }
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

  // The author may delete it only while they are still the player's current
  // coach, or are the player themself.
  const { data: note } = await supabaseAdmin
    .from('timestamp_notes')
    .select('created_by, clip_id, body')
    .eq('id', noteId)
    .maybeSingle()
  if (!note) return { error: 'Not authorized' }
  const player = await playerForClip(note.clip_id as string)
  if (!canDeleteClipItem(user.id, note.created_by as string | null, player)) return { error: 'Not authorized' }

  const { data: deleted, error } = await supabaseAdmin
    .from('timestamp_notes')
    .delete()
    .eq('id', noteId)
    .eq('created_by', user.id)
    .select('id')

  if (error) return { error: describeDbError('deleteTimestampNote', error, 'Could not delete this note.') }
  if (!deleted || deleted.length !== 1) return { error: 'Not authorized' }

  // A voice note's file goes too, once the row is gone, and only inside this clip's ts_voice folder.
  const { data: clipRow } = await supabaseAdmin.from('clips').select('player_id').eq('id', note.clip_id as string).maybeSingle()
  const voicePath = clipRow
    ? timestampVoicePathFor(note.body, clipRow.player_id as string, note.clip_id as string)
    : null
  if (voicePath) {
    // The file must be this note's own: if any other note still points at the
    // same path (e.g. a crafted body copying another note's recording), keep it.
    const { data: others, error: othersError } = await supabaseAdmin
      .from('timestamp_notes')
      .select('id')
      .eq('clip_id', note.clip_id as string)
      .eq('body', note.body as string)
    if (othersError || (others ?? []).length > 0) {
      console.error('[deleteTimestampNote] recording kept: another note uses it or the check failed', { noteId, path: `clips:${voicePath}`, error: othersError?.message ?? null })
      if (othersError) return { success: true, warning: 'Note deleted, but its recording couldn\'t be removed.' }
      return { success: true }
    }
    const { error: storageError } = await supabaseAdmin.storage.from('clips').remove([voicePath])
    if (storageError) {
      console.error('[deleteTimestampNote] storage files left after delete', { noteId, leftoverFiles: [`clips:${voicePath}`], error: storageError.message })
      return { success: true, warning: 'Note deleted, but its recording couldn\'t be removed.' }
    }
  }
  return { success: true }
}

export async function saveLessonPath(clipId: string, lessonPath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, lesson_path').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  if (!isLessonPathFor(lessonPath, clip.player_id, clipId)) {
    console.warn('[saveLessonPath] rejected path', { clipId, lessonPath })
    return { error: 'Invalid lesson file' }
  }
  // Same rule as lesson upload links (src/lib/storage-access.ts): only the
  // player's own coach may write lesson files.
  const decision = await decideStorageAccess(supabaseAdmin, user.id, 'lessons', lessonPath, 'write')
  if (!decision.allowed || decision.playerId !== clip.player_id.toLowerCase()) return { error: 'Not authorized' }
  const { error } = await supabaseAdmin.from('clips').update({ lesson_path: lessonPath }).eq('id', clipId)
  if (error) return { error: error.message }
  // Re-record: remove the previous recording once the new one is attached.
  const previous = clip.lesson_path as string | null
  if (previous && previous !== lessonPath && isLessonPathFor(previous, clip.player_id, clipId)) {
    const { error: removeError } = await supabaseAdmin.storage.from('lessons').remove([previous])
    if (removeError) {
      console.warn('[saveLessonPath] could not remove previous lesson file', { previous, error: removeError.message })
      revalidatePath(`/clips/${clipId}`)
      return { success: true, warning: 'Lesson saved, but the previous recording couldn\'t be removed from storage.' }
    }
  }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function deleteLessonPath(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  // Only the player's own coach (see src/lib/clip-media-delete.ts).
  const result = await removeClipMediaAsOwnCoach(supabaseAdmin, user.id, clipId, 'lesson')
  if ('success' in result) revalidatePath(`/clips/${clipId}`)
  return result
}

export async function deleteVoicePath(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only the player's own coach, as for saving (see src/lib/clip-media-delete.ts).
  const result = await removeClipMediaAsOwnCoach(supabaseAdmin, user.id, clipId, 'voice')
  if ('success' in result) revalidatePath(`/clips/${clipId}`)
  return result
}

export async function saveVoicePath(clipId: string, voicePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }
  // Voice notes are coach commentary: only the player's own (direct) coach.
  const { data: player } = await supabaseAdmin.from('players').select('coach_id').eq('id', clip.player_id).single()
  if (!isPlayersOwnCoach(user.id, player as { coach_id: string | null } | null)) return { error: 'Not authorized' }
  if (!isVoicePathFor(voicePath, clip.player_id, clipId)) return { error: 'Invalid storage path' }

  const { error } = await supabaseAdmin
    .from('clips')
    .update({ voice_path: voicePath })
    .eq('id', clipId)

  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

const CLIP_FILES_CLEANUP_WARNING = 'Clip deleted, but some of its files couldn\'t be cleaned up.'

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

  // The player's current coach, or the player deleting a clip they uploaded.
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, user_id')
    .eq('id', clip.player_id)
    .maybeSingle()

  if (!canDeleteClip(user.id, clip.uploaded_by as string | null, player)) {
    return { error: 'Not authorized' }
  }

  // lesson_path is read separately in case that column isn't migrated yet.
  const { data: lessonRow } = await supabaseAdmin.from('clips').select('lesson_path').eq('id', clipId).maybeSingle()
  const lessonPath = (lessonRow as { lesson_path?: string | null } | null)?.lesson_path ?? null

  // Timestamp voice note files (D3), collected before their rows are deleted.
  const { data: tsNotes, error: tsError } = await supabaseAdmin.from('timestamp_notes').select('body').eq('clip_id', clipId)
  if (tsError) return { error: describeDbError('deleteClip:timestamp_notes', tsError, 'Could not delete this clip.') }
  const tsVoicePaths = ((tsNotes ?? []) as { body: unknown }[])
    .map(n => timestampVoicePathFor(n.body, clip.player_id as string, clipId))
    .filter((p): p is string => p !== null)

  // Stop before the clip row if any of these fails, so a failed delete reports
  // an error instead of a clip that silently lost its marks or notes.
  for (const table of ['annotations', 'timestamp_notes', 'pitch_metrics']) {
    const { error: childError } = await supabaseAdmin.from(table).delete().eq('clip_id', clipId)
    if (childError) return { error: describeDbError(`deleteClip:${table}`, childError, 'Could not delete this clip.') }
  }

  const { error } = await supabaseAdmin.from('clips').delete().eq('id', clipId)
  if (error) return { error: error.message }

  // Files are removed only after the check above passed and the clip row is
  // gone, with the service client (the caller's session may not be allowed to
  // delete another uploader's files), and only inside this player's folder.
  // A failed file removal doesn't undo the delete: it is logged and the
  // caller gets a warning to show.
  let cleanupFailed = false
  const files = clipFilesToRemove(clip.player_id as string, [clip.storage_path, clip.voice_path, ...tsVoicePaths])
  if (files.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage.from('clips').remove(files)
    if (storageError) { console.error('[deleteClip] storage cleanup failed', clipId, storageError.message); cleanupFailed = true }
  }
  // Lesson recordings live in the lessons bucket.
  if (lessonPath && isLessonPathFor(lessonPath, clip.player_id as string, clipId)) {
    const { error: lessonError } = await supabaseAdmin.storage.from('lessons').remove([lessonPath])
    if (lessonError) { console.error('[deleteClip] lesson cleanup failed', clipId, lessonError.message); cleanupFailed = true }
  }

  revalidatePath('/dashboard')
  return cleanupFailed ? { success: true, warning: CLIP_FILES_CLEANUP_WARNING } : { success: true }
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

  // spin_axis is degrees clockwise from 12:00 (see src/lib/spin-axis.ts).
  if (data.spin_axis != null && !(Number.isFinite(data.spin_axis) && data.spin_axis >= 0 && data.spin_axis < 360)) {
    return { error: 'Axis must be a clock time from 1:00 to 12:59.' }
  }

  // extension and vaa are new columns — insert fault-tolerantly
  const baseInsert = { clip_id: clipId, created_by: user.id, ...data }
  let { row, error: insertError } = await addPitchMetricRow(baseInsert)

  // Until migration 020 makes spin_axis numeric, the column is integer and
  // half-degree values (any odd minute, e.g. 8:45 = 262.5°) are rejected with
  // 22P02. Save the nearest whole degree instead and say so.
  let warning: string | undefined
  if (insertError && data.spin_axis != null && !Number.isInteger(data.spin_axis) && isIntegerSyntaxError(insertError)) {
    console.error('[addPitchMetric] pitch_metrics.spin_axis is still integer; apply supabase/migrations/020_spin_axis_numeric.sql', insertError)
    const rounded = Math.round(data.spin_axis) % 360
    const retry = await addPitchMetricRow({ ...baseInsert, spin_axis: rounded })
    row = retry.row
    insertError = retry.error
    if (!insertError) warning = `Axis was rounded to ${degreesToClock(rounded)} because the database only stores whole degrees for now.`
  }

  if (insertError) return { error: describeDbError('addPitchMetric', insertError, 'Could not save this pitch.') }
  return { metric: row, warning }
}

function isIntegerSyntaxError(error: { code?: string; message?: string }) {
  return error.code === '22P02' && (error.message ?? '').includes('integer')
}

// Insert one pitch_metrics row, dropping extension/vaa if those columns are missing.
async function addPitchMetricRow(insert: Record<string, unknown>) {
  const full = await supabaseAdmin
    .from('pitch_metrics')
    .insert(insert)
    .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa')
    .single()
  if (!(full.error?.code === 'PGRST204' || full.error?.message?.includes('extension') || full.error?.message?.includes('vaa'))) {
    return { row: full.data as Record<string, unknown> | null, error: full.error }
  }
  const core = { ...insert }
  delete core.extension
  delete core.vaa
  const fallback = await supabaseAdmin
    .from('pitch_metrics')
    .insert(core)
    .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
    .single()
  return { row: fallback.data as Record<string, unknown> | null, error: fallback.error }
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

// Coach notes on a clip (create, edit, clear). Written only here, on the
// server with the service client, after the check below; the browser no
// longer writes clips.notes directly.
//
// Who can edit: the player's direct coach (players.coach_id), or any coach on
// one of the player's teams (organizer or assistant in team_coaches), the same
// rule as the corrected 018 RLS policies. "Player's teams" means players.team_id
// plus player_teams rows, because the app links players through player_teams.
// Blank text clears the notes (stored as null); see src/lib/clip-notes.ts.
export async function saveClipNotes(clipId: string, notes: string | null, expectedNotes?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  if (typeof clipId !== 'string' || !clipId) return { error: 'Clip not found' }
  const normalized = normalizeClipNotes(notes)
  if (!normalized.ok) return { error: normalized.error }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('player_id, notes')
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

  // Stale-write guard (QA-002): refuse to overwrite notes that changed since
  // this client loaded or last saved them. No version column exists, so the
  // notes text itself is the version (check-then-write; no migration).
  if (isStaleClipNotesWrite(clip.notes as string | null, expectedNotes)) {
    return { error: CLIP_NOTES_CONFLICT_ERROR, conflict: true }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('clips')
    .update({ notes: normalized.notes })
    .eq('id', clipId)
    .select('id')
  if (error) return { error: describeDbError('saveClipNotes', error, 'Could not save notes.') }
  if (!updated || updated.length === 0) {
    console.error('[saveClipNotes] update matched no rows', { clipId })
    return { error: 'Could not save notes. Please refresh and try again.' }
  }
  return { success: true, notes: normalized.notes }
}
