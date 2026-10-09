'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendClipUploadedEmail } from '@/lib/email'
import type { ClipKind } from '@/lib/positions'
import type { PitchImport } from '@/lib/pitch-import'

export async function getSignedUploadUrl(storagePath: string, bucket: 'clips' | 'lessons' = 'clips') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath, { upsert: true })

  if (error || !data) return { error: error?.message ?? 'Failed to create upload URL' }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function getClipsSignedUrl(storagePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabaseAdmin.storage
    .from('clips')
    .createSignedUrl(storagePath, 3600)

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

type HittingMetrics = { ev_avg: number | null; ev_max: number | null; launch_angle_avg: number | null; barrel_rate: number | null; hard_hit_rate: number | null; sweet_spot_rate: number | null; attack_angle: number | null; bat_speed: number | null; ev_90th?: number | null; distance_avg?: number | null; distance_max?: number | null; pull_rate?: number | null; oppo_rate?: number | null; gb_rate?: number | null; ld_rate?: number | null; fb_rate?: number | null; contact_rate?: number | null; whiff_rate?: number | null }
export async function saveHittingMetrics(clipId: string, metrics: HittingMetrics) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

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

  if (!(await isCoachForPlayer(user.id, clip.player_id)) && clip.uploaded_by !== user.id) {
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

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

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

  if (error) return { error: error.message }
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

  if (!(await isTeamCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

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

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

  const { data: rows, error } = await supabaseAdmin.rpc('rp_save_timestamp_note', {
    p_clip_id: data.clip_id,
    p_created_by: user.id,
    p_time_seconds: data.time_seconds,
    p_body: data.body,
    p_drawing_data: (data.drawing_data ?? null) as unknown,
  })

  if (error) return { error: error.message }
  const note = Array.isArray(rows) ? rows[0] : rows
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

async function isCoachForPlayer(userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, team_id, user_id')
    .eq('id', playerId)
    .single()
  if (!player) return false
  if (player.coach_id === userId || player.user_id === userId) return true
  const { data: links } = await supabaseAdmin
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
  const teamIds = (links ?? []).map((l: { team_id: string }) => l.team_id)
  if (teamIds.length === 0) return false
  const { data: membership } = await supabaseAdmin
    .from('team_coaches')
    .select('coach_id')
    .eq('coach_id', userId)
    .in('team_id', teamIds)
    .limit(1)
    .maybeSingle()
  return !!membership
}

// Coach-only check (doesn't allow the player themselves)
async function isTeamCoachForPlayer(userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id, team_id')
    .eq('id', playerId)
    .single()
  if (!player) return false
  if (player.coach_id === userId) return true
  const { data: links } = await supabaseAdmin
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
  const teamIds = (links ?? []).map((l: { team_id: string }) => l.team_id)
  if (teamIds.length === 0) return false
  const { data: membership } = await supabaseAdmin
    .from('team_coaches')
    .select('coach_id')
    .eq('coach_id', userId)
    .in('team_id', teamIds)
    .limit(1)
    .maybeSingle()
  return !!membership
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

  if (clip.uploaded_by !== user.id && !(await isTeamCoachForPlayer(user.id, clip.player_id))) {
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

  if (!(await isTeamCoachForPlayer(user.id, clip.player_id))) return { error: 'Only coaches can save the mechanics checklist' }

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

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

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

  if (!(await isTeamCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('clips').update({ reframe }).eq('id', clipId)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function getLessonReplay(lessonId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Try lessons table first, fall back to legacy lesson_path on clips
  let row: { clip_id?: string; media_path: string; format_version: number | null; timeline: unknown; duration_ms: number | null } | null = null

  const { data: lesson } = await supabaseAdmin
    .from('lessons')
    .select('clip_id, media_path, format_version, timeline, duration_ms')
    .eq('id', lessonId)
    .maybeSingle()

  if (lesson) {
    row = lesson as unknown as typeof row
  } else {
    const { data: clip } = await supabaseAdmin.from('clips').select('id, lesson_path').eq('id', lessonId).maybeSingle()
    if (clip?.lesson_path) row = { clip_id: clip.id, media_path: clip.lesson_path, format_version: 1, timeline: null, duration_ms: null }
  }

  if (!row) return { error: 'Lesson not found' }

  const sign = async (path: string, bucket = 'lessons') => {
    const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }

  const mediaUrl = await sign(row.media_path)
  if (!mediaUrl) return { error: 'Could not generate replay URL' }

  if (row.format_version !== 2 || !row.timeline) {
    return { format: 1 as const, mediaUrl }
  }

  const clipPath = row.clip_id ? (await supabaseAdmin.from('clips').select('storage_path').eq('id', row.clip_id).maybeSingle()).data?.storage_path ?? null : null
  const videoUrl = clipPath ? await sign(clipPath, 'clips') : null

  return {
    format: 2 as const,
    mediaUrl,
    videoUrl: videoUrl ?? mediaUrl,
    timeline: row.timeline,
    durationMs: row.duration_ms,
  }
}

export async function deleteLesson(lessonId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error: fetchErr } = await supabaseAdmin
    .from('lessons')
    .select('storage_path, created_by')
    .eq('id', lessonId)
    .single()

  if (fetchErr || !data) return { error: 'Not found' }
  if (data.created_by !== user.id) return { error: 'Not authorized' }

  if (data.storage_path) {
    await supabaseAdmin.storage.from('lessons').remove([data.storage_path])
  }

  const { error } = await supabaseAdmin.from('lessons').delete().eq('id', lessonId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function saveClipKind(clipId: string, kind: ClipKind) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin.from('clips').update({ clip_kind: kind }).eq('id', clipId)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}

export async function deletePitchMetric(metricId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin.from('pitch_metrics').delete().eq('id', metricId).eq('created_by', user.id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteAllPitchMetrics(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin.from('pitch_metrics').delete().eq('clip_id', clipId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function importPitchMetrics(clipId: string, payload: PitchImport) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  if (!(await isCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

  const rows = (payload as { rows?: unknown[] }).rows ?? (Array.isArray(payload) ? payload : [])
  const inserts = (rows as Record<string, unknown>[]).map((r) => ({ clip_id: clipId, created_by: user.id, ...r }))
  if (inserts.length === 0) return { error: 'No rows to import' }

  const { error } = await supabaseAdmin.from('pitch_metrics').insert(inserts)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true, count: inserts.length }
}

export async function saveClipNotes(clipId: string, notes: string, baseline?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id, notes').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  if (baseline !== undefined && clip.notes !== baseline) {
    return { error: 'Notes were updated by someone else.', conflict: true, notes: clip.notes }
  }

  const { error } = await supabaseAdmin.from('clips').update({ notes }).eq('id', clipId)
  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true, notes }
}

export async function getClipNotes(clipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabaseAdmin.from('clips').select('notes').eq('id', clipId).single()
  if (error) return { error: error.message }
  return { notes: data?.notes ?? null }
}

export async function setPinnedComparison(
  clipId: string,
  youtubeId: string | null,
  note: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clip } = await supabaseAdmin.from('clips').select('player_id').eq('id', clipId).single()
  if (!clip) return { error: 'Clip not found' }

  if (!(await isTeamCoachForPlayer(user.id, clip.player_id))) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin
    .from('clips')
    .update({ featured_youtube_id: youtubeId, featured_comparison_note: note })
    .eq('id', clipId)

  if (error) return { error: error.message }
  revalidatePath(`/clips/${clipId}`)
  return { success: true }
}
