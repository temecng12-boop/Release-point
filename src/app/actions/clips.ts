'use server'
import { describeDbError, isMissingColumnError } from '@/lib/db-errors'
import { normalizeClipNotes } from '@/lib/clip-notes'
import { writeClipNotesAtomic } from '@/lib/clip-notes-write'
import { isCoachOnPlayersTeam } from '@/lib/team-access'
import { degreesToClock, roundAxisForIntegerColumn } from '@/lib/spin-axis'
import { pitchAxisError, validatePitchImport, type PitchImport } from '@/lib/pitch-import'
import { readClipLessonFiles, deleteLessonRecord, saveLessonRecord } from '@/lib/lessons-write'
import { loadLessonReplay } from '@/lib/lessons'
import { isVoicePathFor, timestampVoicePathFor } from '@/lib/voice-path'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendClipUploadedEmail } from '@/lib/email'
import { decideStorageAccess } from '@/lib/storage-access'
import { canUploadForPlayer, playerIdFromStoragePath } from '@/lib/auth/player-access'
import { canDeleteClip, canDeleteClipItem, isPlayersOwnCoach } from '@/lib/auth/roster-access'
import { clipFilesToRemove } from '@/lib/clip-storage'
import { checkUploadConsent, uploadBlockedMessageFor } from '@/lib/consent-server'
import { isConsentPendingError, UPLOAD_BLOCKED_MESSAGE } from '@/lib/consent'
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

/** The consent refusal as friendly copy for this user (player or coach wording); other errors unchanged. */
async function consentErrorFor(error: string, playerId: string): Promise<string> {
  if (error !== UPLOAD_BLOCKED_MESSAGE) return error
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? uploadBlockedMessageFor(supabaseAdmin, playerId, user.id) : error
}

/**
 * Removes a just-uploaded clip video whose clip row couldn't be saved. Only a
 * top-level file in this player's folder, and only if no clip uses it.
 * Failures are logged; the caller returns an error either way.
 */
async function discardUploadedClipFile(playerId: string, storagePath: string, context: string): Promise<void> {
  const [path] = clipFilesToRemove(playerId, [storagePath])
  if (!path || path.split('/').length !== 2) return
  const { data: users, error: usedError } = await supabaseAdmin.from('clips').select('id').eq('storage_path', path).limit(1)
  if (usedError || (users ?? []).length > 0) {
    console.error(`[${context}] uploaded file kept: in use by a clip or the check failed`, { path, error: usedError?.message ?? null })
    return
  }
  const { error } = await supabaseAdmin.storage.from('clips').remove([path])
  if (error) console.error(`[${context}] could not remove the uploaded file`, { path, error: error.message })
}

export async function getSignedUploadUrl(storagePath: string, bucket: 'clips' | 'lessons' = 'clips') {
  const check = await checkStorageAccess('getSignedUploadUrl', bucket, storagePath, 'write')
  if ('error' in check) return { error: check.error }

  // No media for a player who isn't a confirmed adult and has no guardian consent on record.
  const pathPlayerId = playerIdFromStoragePath(storagePath)
  if (!pathPlayerId) return { error: 'Invalid upload path' }
  // Checked before any file is stored, so a blocked upload leaves nothing behind.
  const consent = await checkUploadConsent(supabaseAdmin, pathPlayerId)
  if (!consent.ok) return { error: await consentErrorFor(consent.error, pathPlayerId) }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    console.error('[getSignedUploadUrl] could not create upload URL', { bucket, path: storagePath, message: error?.message ?? 'no data' })
    return { error: 'Couldn\'t start the upload. Please try again.' }
  }
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
  // The video is already in storage at this point (uploaded with the signed
  // URL). If the clip can't be saved, the file is removed so nothing is left
  // behind, and the error is returned: never a success.
  const consent = await checkUploadConsent(supabaseAdmin, data.player_id)
  if (!consent.ok) {
    await discardUploadedClipFile(data.player_id, data.storage_path, 'createClip:consent')
    return { error: await consentErrorFor(consent.error, data.player_id) }
  }

  const { data: newClip, error } = await supabaseAdmin.from('clips').insert({
    player_id:    data.player_id,
    storage_path: data.storage_path,
    title:        data.title,
    session_date: data.session_date,
    uploaded_by:  user.id,
  }).select('id').single()

  if (error) {
    await discardUploadedClipFile(data.player_id, data.storage_path, 'createClip:insert')
    // Migration 023's trigger refuses clips for players without 18+ or guardian consent.
    if (isConsentPendingError(error)) {
      console.warn('[createClip] refused by the consent trigger', { playerId: data.player_id })
      return { error: await uploadBlockedMessageFor(supabaseAdmin, data.player_id, user.id) }
    }
    return { error: describeDbError('createClip', error, 'Could not save this clip.') }
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

type HittingMetrics = { ev_avg: number | null; ev_max: number | null; launch_angle_avg: number | null; barrel_rate: number | null; hard_hit_rate: number | null; sweet_spot_rate: number | null; attack_angle: number | null; bat_speed: number | null }
export async function saveHittingMetrics(clipId: string, metrics: HittingMetrics) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again to save hitting data.' }

  // Same rule as pitch data (pitchMetricWriteAccess): direct coach or the player.
  const access = await pitchMetricWriteAccess(user.id, clipId)
  if (access === 'error') return { error: 'Couldn\'t check access to this clip. Please try again.' }
  if (access === 'no-clip') return { error: 'This clip no longer exists.' }
  if (access === 'denied') return { error: 'Only the player\'s coach or the player can edit hitting data for this clip.' }

  const { data: changed, error } = await supabaseAdmin.from('clips').update({ hitting_metrics: metrics }).eq('id', clipId).select('id')
  if (error) return { error: describeDbError('saveHittingMetrics', error, 'Couldn\'t save the hitting data.') }
  if (!changed || changed.length === 0) {
    console.error('[saveHittingMetrics] update changed 0 rows', clipId)
    return { error: 'Couldn\'t save the hitting data. Refresh the page and try again.' }
  }

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

// A new lesson recording: adds a lessons row (never deletes older lessons) and
// points clips.lesson_path at it. Coach-only; see src/lib/lessons-write.ts.
export async function saveLessonPath(clipId: string, lessonPath: string, meta: { mime?: string | null; durationMs?: number | null; timeline?: unknown } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // No new lesson for a player without 18+ confirmation or guardian consent
  // (#17). Checked only for the player's own coach; anyone else is refused
  // by saveLessonRecord without learning the player's consent status.
  if (user) {
    const owner = await playerForClip(clipId)
    if (owner && isPlayersOwnCoach(user.id, owner)) {
      const { data: clipRow } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).maybeSingle()
      if (clipRow) {
        const consent = await checkUploadConsent(supabaseAdmin, clipRow.player_id as string)
        if (!consent.ok) return { error: consent.error }
      }
    }
  }
  const result = await saveLessonRecord(supabaseAdmin, user?.id, clipId, lessonPath, meta)
  if ('success' in result) revalidatePath(`/clips/${clipId}`)
  return result
}

// Playback for one lesson: signed URLs for the lesson file and, for timeline
// lessons, the original clip video (both through the storage ownership check).
export async function getLessonReplay(lessonId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const src = await loadLessonReplay(supabaseAdmin, user?.id, lessonId)
  if ('error' in src) return { error: src.error }
  const { data: media } = await supabaseAdmin.storage.from('lessons').createSignedUrl(src.mediaPath, 3600)
  if (!media?.signedUrl) return { error: 'Could not load this lesson.' }
  if (src.format === 1) return { format: 1 as const, mediaUrl: media.signedUrl }
  const { data: clip } = await supabaseAdmin.storage.from('clips').createSignedUrl(src.clipPath, 3600)
  if (!clip?.signedUrl) return { error: 'Could not load the clip video for this lesson.' }
  return { format: 2 as const, mediaUrl: media.signedUrl, videoUrl: clip.signedUrl, timeline: src.timeline, durationMs: src.durationMs }
}

export async function deleteLesson(lessonId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const result = await deleteLessonRecord(supabaseAdmin, user?.id, lessonId)
  if ('success' in result && result.clipId) revalidatePath(`/clips/${result.clipId}`)
  return 'error' in result ? { error: result.error } : { success: true as const }
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
  const consent = await checkUploadConsent(supabaseAdmin, clip.player_id)
  if (!consent.ok) return { error: consent.error }

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

  // Every lesson file of this clip (lessons bucket), collected before the rows
  // cascade away. If they can't be read, stop: deleting now would leave the
  // recordings behind with nothing pointing at them.
  const lessons = await readClipLessonFiles(supabaseAdmin, clipId, clip.player_id as string)
  if (lessons.error) return { error: describeDbError('deleteClip:lessons', lessons.error, 'Could not delete this clip.') }
  const lessonFiles = lessons.files

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
  // Every lesson file of this clip (lessons bucket), not only lesson_path.
  if (lessonFiles.length) {
    const { error: lessonRemoveError } = await supabaseAdmin.storage.from('lessons').remove(lessonFiles)
    if (lessonRemoveError) { console.error('[deleteClip] lesson file cleanup failed', clipId, lessonRemoveError.message); cleanupFailed = true }
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

  const access = await pitchMetricWriteAccess(user.id, clipId)
  if (access === 'no-clip') return { error: 'Clip not found' }
  if (access !== 'ok') return { error: 'Not authorized' }

  // spin_axis is degrees clockwise from 12:00 (see src/lib/spin-axis.ts).
  const axisError = pitchAxisError(data.spin_axis)
  if (axisError) return { error: axisError }

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

/**
 * Who may add pitch rows to a clip: the direct coach of the clip's player
 * (players.coach_id) or the player themself (players.user_id). Team coaches
 * (read-only under 031), guardians and everyone else may not. The rows are
 * then written with the service role, so this check is the only gate.
 */
async function pitchMetricWriteAccess(userId: string, clipId: string): Promise<'ok' | 'no-clip' | 'denied' | 'error'> {
  const { data: clip, error: clipError } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).maybeSingle()
  if (clipError) { console.error('[pitchMetricWriteAccess] clip lookup failed', clipId, clipError); return 'error' }
  if (!clip?.player_id) return 'no-clip'
  const { data: player, error: playerError } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', clip.player_id).maybeSingle()
  if (playerError) { console.error('[pitchMetricWriteAccess] player lookup failed', clip.player_id, playerError); return 'error' }
  if (!player) return 'no-clip'
  return player.coach_id === userId || player.user_id === userId ? 'ok' : 'denied'
}

const IMPORT_COLUMNS = 'id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa'
const IMPORT_COLUMNS_CORE = 'id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break'

/**
 * Save an imported CSV or TrackMan PDF to a clip's pitch rows. Same access
 * rule as addPitchMetric (direct coach, or the player on their own clip);
 * the import is validated again here (lib/pitch-import.ts) and saved as ONE
 * insert, so it is all-or-nothing: either every pitch is saved and returned,
 * or none is and an error comes back.
 */
export async function importPitchMetrics(clipId: string, input: PitchImport): Promise<
  { error: string } | { metrics: Record<string, unknown>[]; warning?: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again to import pitch data.' }

  const access = await pitchMetricWriteAccess(user.id, clipId)
  if (access === 'error') return { error: 'Couldn\'t check access to this clip. Please try again.' }
  if (access === 'no-clip') return { error: 'This clip no longer exists.' }
  if (access === 'denied') return { error: 'Only the player\'s coach or the player can import pitch data for this clip.' }

  const checked = validatePitchImport(input)
  if (!checked.ok) return { error: checked.error }
  const inserts = checked.rows.map(r => ({ clip_id: clipId, created_by: user.id, ...r }))
  const total = inserts.length
  const run = (rows: typeof inserts) => supabaseAdmin.from('pitch_metrics').insert(rows)
    .select(rows.some(r => 'extension' in r || 'vaa' in r) ? IMPORT_COLUMNS : IMPORT_COLUMNS_CORE)

  let { data, error } = await run(inserts)
  // Before migration 020, spin_axis is integer and fractional degrees are
  // rejected (22P02). One retry with whole degrees, and say so.
  let warning: string | undefined
  const fractional = inserts.find(r => r.spin_axis != null && !Number.isInteger(r.spin_axis))
  if (error && fractional && isIntegerSyntaxError(error)) {
    console.error('[importPitchMetrics] spin_axis is still integer; apply supabase/migrations/020_spin_axis_numeric.sql', error)
    const retry = await run(inserts.map(r => ({ ...r, spin_axis: roundAxisForIntegerColumn(r.spin_axis) })))
    data = retry.data
    error = retry.error
    const example = fractional.spin_axis as number
    if (!error) warning = `Axis values were rounded to whole degrees (e.g. ${degreesToClock(example)} saved as ${degreesToClock(roundAxisForIntegerColumn(example) as number)}) because the database only stores whole degrees for now.`
  }
  if (error) return { error: describeDbError('importPitchMetrics', error, 'Couldn\'t save these pitches. Nothing was saved. Please try again.') }

  const saved = (data ?? []) as unknown as Record<string, unknown>[]
  if (saved.length !== total) {
    // One INSERT is atomic, so this shouldn't happen; never report it as a full success.
    console.error('[importPitchMetrics] insert returned', saved.length, 'of', total, 'rows', clipId)
    return { error: `Only ${saved.length} of ${total} pitches were confirmed saved. Refresh the page to check before importing again.` }
  }
  revalidatePath(`/clips/${clipId}`)
  return { metrics: saved, ...(warning ? { warning } : {}) }
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

  // Stale-write guard (QA-002), atomic in Postgres (save_clip_notes, 027):
  // the update only applies if the note is still what this client last saw;
  // a save whose response was lost is recognised on retry.
  // See src/lib/clip-notes-write.ts.
  // The RPC runs with the caller's session, so RLS on clips also decides.
  const result = await writeClipNotesAtomic(
    { rpc: (fn, args) => supabase.rpc(fn, args), legacy: supabaseAdmin },
    clipId, (clip.notes as string | null) ?? null, normalized.notes, expectedNotes,
  )
  if (result.ok) return { success: true, notes: result.notes }
  if (result.conflict) return { error: result.error, conflict: true }
  if (result.dbError === 'missing') return { error: 'Clip not found' }
  return { error: describeDbError('saveClipNotes', result.dbError, 'Could not save notes.') }
}

// Current coach notes, for the editor to recover after a lost save response.
// Same readers as the clip page's notes: the player's coaches.
export async function getClipNotes(clipId: string): Promise<{ notes: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  if (typeof clipId !== 'string' || !clipId) return { error: 'Clip not found' }
  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, notes').eq('id', clipId).maybeSingle()
  if (!clip) return { error: 'Clip not found' }
  const { data: player } = await supabaseAdmin.from('players').select('coach_id, team_id').eq('id', clip.player_id).maybeSingle()
  if (!player) return { error: 'Clip not found' }
  const allowed = player.coach_id === user.id
    || await isCoachOnPlayersTeam(user.id, clip.player_id, player.team_id as string | null)
  if (!allowed) return { error: 'Not authorized' }
  return { notes: (clip.notes as string | null) ?? null }
}
