// Server-side writes for lesson recordings (service-role client, caller checked).
// Rules: only the player's DIRECT coach (players.coach_id) may add or delete
// lessons; team coaches can view them but not manage them. The lessons-bucket
// write check (src/lib/storage-access.ts) must also pass, and the path must be a
// lesson file for exactly that player and clip (src/lib/lesson-path.ts).
// New recordings never delete older ones.
import { lessonTotalMs } from './lesson-recording'
import { decideStorageAccess } from './storage-access'
import { isLessonPathFor, lessonBaseMime, lessonMimeMatchesPath } from './lesson-path'
import { isMissingTableError, LESSONS_MISSING_MESSAGE } from './lessons'
import { MAX_TIMELINE_BYTES, TIMELINE_VERSION, validateTimeline, timelineBytes } from './lesson-timeline/schema'

type DbError = { code?: string; message: string } | null
type Q = PromiseLike<{ data: unknown; error: DbError }> & {
  eq(c: string, v: string): Q
  order(c: string, o: { ascending: boolean }): Q
  limit(n: number): Q
  maybeSingle(): PromiseLike<{ data: unknown; error: DbError }>
}
type Client = {
  from(t: string): {
    select(c: string): Q
    insert(v: Record<string, unknown>): PromiseLike<{ error: DbError }>
    update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<{ error: DbError }> }
    delete(): { eq(c: string, v: string): PromiseLike<{ error: DbError }> }
  }
  storage: { from(b: string): { remove(paths: string[]): PromiseLike<{ error: DbError }> } }
}

export const LESSONS_MISSING_TIMELINE_MESSAGE =
  'Lesson audio saved, but the drawing replay needs a database update (migration 025) and was not kept.'

export type LessonWriteResult = { success: true; warning?: string } | { error: string }

export const LESSON_DENIED = 'Only this player\'s coach can save or delete lessons.'

/** Direct coach of the player (players.coach_id), after the storage write check for the path passed. */
async function isDirectCoachWriter(client: unknown, userId: string, playerId: string, path: string): Promise<{ ok: boolean; reason: string }> {
  const access = await decideStorageAccess(client, userId, 'lessons', path, 'write')
  if (!access.allowed) return { ok: false, reason: access.reason }
  if (access.playerId !== playerId.toLowerCase()) return { ok: false, reason: 'path is for another player' }
  const { data } = await (client as Client).from('players').select('coach_id').eq('id', playerId).maybeSingle()
  if ((data as { coach_id?: string | null } | null)?.coach_id !== userId) return { ok: false, reason: `not the direct coach (${access.via})` }
  return { ok: true, reason: 'direct coach' }
}

export async function saveLessonRecord(
  client: unknown,
  userId: string | null | undefined,
  clipId: string,
  lessonPath: string,
  meta: { mime?: string | null; durationMs?: number | null; timeline?: unknown } = {},
): Promise<LessonWriteResult> {
  if (!userId) return { error: 'Not authenticated' }
  const db = client as Client
  const { data: clip } = await db.from('clips').select('player_id').eq('id', clipId).maybeSingle()
  const playerId = (clip as { player_id?: string } | null)?.player_id
  if (!playerId) return { error: 'Clip not found' }
  if (!isLessonPathFor(lessonPath, playerId, clipId)) {
    console.warn('[saveLesson] rejected path', { clipId, lessonPath })
    return { error: 'Invalid lesson file' }
  }
  const access = await isDirectCoachWriter(client, userId, playerId, lessonPath)
  if (!access.ok) {
    console.warn('[saveLesson] denied', { userId, clipId, reason: access.reason })
    return { error: LESSON_DENIED }
  }

  // The stored type is the real one the file was uploaded with (audio/* for
  // timeline lessons, video/* for older video lessons), never relabeled.
  let mime: string | null = null
  if (meta.mime != null) {
    mime = lessonBaseMime(meta.mime)
    if (!mime || !lessonMimeMatchesPath(mime, lessonPath)) return { error: 'Unsupported lesson file type' }
  }
  if (meta.timeline != null && !mime?.startsWith('audio/')) return { error: 'Invalid lesson timeline: the recording must be audio' }

  // Timeline lessons (format 2): audio file + validated event timeline.
  let timeline = null
  if (meta.timeline != null) {
    const checked = validateTimeline(meta.timeline)
    if (!checked.ok) {
      console.warn('[saveLesson] rejected timeline', { clipId, error: checked.error })
      return { error: checked.error }
    }
    if (timelineBytes(checked.timeline) > MAX_TIMELINE_BYTES) return { error: 'Invalid lesson timeline: too large' }
    timeline = checked.timeline
  }

  // QA-005: always keep a length. The recorder measures it (webm files report
  // Infinity); for timeline lessons fall back to the timeline's own length.
  const measured = lessonTotalMs(meta.durationMs, timeline?.durationMs)
  const duration = measured == null ? null : Math.min(measured, 2_147_483_647)
  const { error: insertError } = await db.from('lessons').insert({
    clip_id: clipId, player_id: playerId, coach_id: userId, media_path: lessonPath,
    mime,
    duration_ms: duration,
    ...(timeline ? { timeline, format_version: TIMELINE_VERSION } : {}),
  })
  let warning: string | undefined
  if (insertError) {
    if (!isMissingTableError(insertError)) {
      console.error('[saveLesson] insert failed', { clipId, code: insertError.code, message: insertError.message })
      return { error: 'Could not save this lesson. Please try again.' }
    }
    console.error('[saveLesson] public.lessons missing; apply supabase/migrations/025_lessons.sql')
    warning = timeline ? LESSONS_MISSING_TIMELINE_MESSAGE : LESSONS_MISSING_MESSAGE
  }
  // Newest lesson on the clip, for older app code that reads clips.lesson_path.
  const { error: updateError } = await db.from('clips').update({ lesson_path: lessonPath }).eq('id', clipId)
  if (updateError) {
    console.error('[saveLesson] clips.lesson_path update failed', { clipId, message: updateError.message })
    if (warning) return { error: 'Could not save this lesson. Please try again.' }
  }
  return warning ? { success: true, warning } : { success: true }
}

export async function deleteLessonRecord(client: unknown, userId: string | null | undefined, lessonId: string): Promise<LessonWriteResult & { clipId?: string }> {
  if (!userId) return { error: 'Not authenticated' }
  const db = client as Client
  let clipId: string, mediaPath: string, playerId: string, legacy = false
  if (lessonId.startsWith('legacy:')) {
    clipId = lessonId.slice('legacy:'.length)
    const { data } = await db.from('clips').select('player_id, lesson_path').eq('id', clipId).maybeSingle()
    const c = data as { player_id?: string; lesson_path?: string | null } | null
    if (!c?.lesson_path || !c.player_id) return { error: 'Lesson not found' }
    mediaPath = c.lesson_path; playerId = c.player_id; legacy = true
  } else {
    const { data, error } = await db.from('lessons').select('clip_id, player_id, media_path').eq('id', lessonId).maybeSingle()
    if (error && isMissingTableError(error)) return { error: 'Lesson not found' }
    const row = data as { clip_id: string; player_id: string; media_path: string } | null
    if (!row) return { error: 'Lesson not found' }
    clipId = row.clip_id; mediaPath = row.media_path; playerId = row.player_id
  }
  const access = await isDirectCoachWriter(client, userId, playerId, mediaPath)
  if (!access.ok) {
    console.warn('[deleteLesson] denied', { userId, lessonId, reason: access.reason })
    return { error: LESSON_DENIED }
  }
  const { error: removeError } = await db.storage.from('lessons').remove([mediaPath])
  if (removeError) {
    console.error('[deleteLesson] storage remove failed', { lessonId, message: removeError.message })
    return { error: 'Could not delete this lesson. Please try again.' }
  }
  // The lessons row: by id, or for a legacy id (clips.lesson_path) the row 025
  // backfilled for that same file. Before 025 there is no table and nothing to remove.
  const { error: rowError } = legacy
    ? await db.from('lessons').delete().eq('media_path', mediaPath)
    : await db.from('lessons').delete().eq('id', lessonId)
  if (rowError && !(legacy && isMissingTableError(rowError))) return { error: 'Could not delete this lesson. Please try again.' }
  // Keep clips.lesson_path pointing at the newest remaining lesson (or none).
  const { data: clipRow } = await db.from('clips').select('lesson_path').eq('id', clipId).maybeSingle()
  if ((clipRow as { lesson_path?: string | null } | null)?.lesson_path === mediaPath) {
    const { data: newest, error } = await db.from('lessons').select('media_path').eq('clip_id', clipId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const next = error ? null : (newest as { media_path?: string } | null)?.media_path ?? null
    await db.from('clips').update({ lesson_path: next }).eq('id', clipId)
  }
  return { success: true, clipId }
}

/**
 * Every lesson file of a clip (all lessons rows plus clips.lesson_path), for
 * removal when the clip is deleted. Tolerates a missing lessons table; only
 * paths inside this player's/clip's folder are returned.
 */
export async function clipLessonFiles(client: unknown, clipId: string, playerId: string): Promise<string[]> {
  const db = client as Client
  const paths = new Set<string>()
  const { data: rows, error } = await db.from('lessons').select('media_path').eq('clip_id', clipId)
  if (error && !isMissingTableError(error)) console.error('[clipLessonFiles] lessons read failed', { clipId, message: error.message })
  for (const r of (rows ?? []) as { media_path: string }[]) paths.add(r.media_path)
  const { data: clip } = await db.from('clips').select('lesson_path').eq('id', clipId).maybeSingle()
  const lp = (clip as { lesson_path?: string | null } | null)?.lesson_path
  if (lp) paths.add(lp)
  return [...paths].filter(p => isLessonPathFor(p, playerId, clipId))
}
