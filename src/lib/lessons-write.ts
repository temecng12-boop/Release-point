// Server-side writes for lesson recordings (service-role client, caller checked).
// Rules: only the player's coaches (direct or team) may add or delete lessons,
// the same write rule as the lessons bucket (src/lib/storage-access.ts); the path
// must be a lesson file for exactly that player and clip (src/lib/lesson-path.ts).
// New recordings never delete older ones.
import { decideStorageAccess } from './storage-access'
import { isLessonPathFor } from './lesson-path'
import { isMissingTableError, LESSONS_MISSING_MESSAGE } from './lessons'

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

export type LessonWriteResult = { success: true; warning?: string } | { error: string }

export const LESSON_DENIED = 'Only this player\'s coaches can save or delete lessons.'

export async function saveLessonRecord(
  client: unknown,
  userId: string | null | undefined,
  clipId: string,
  lessonPath: string,
  meta: { mime?: string | null; durationMs?: number | null } = {},
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
  const access = await decideStorageAccess(client, userId, 'lessons', lessonPath, 'write')
  if (!access.allowed) {
    console.warn('[saveLesson] denied', { userId, clipId, reason: access.reason })
    return { error: LESSON_DENIED }
  }

  const duration = meta.durationMs != null && Number.isFinite(meta.durationMs) && meta.durationMs >= 0
    ? Math.min(Math.round(meta.durationMs), 2_147_483_647) : null
  const { error: insertError } = await db.from('lessons').insert({
    clip_id: clipId, player_id: playerId, coach_id: userId, media_path: lessonPath,
    mime: meta.mime ? String(meta.mime).split(';')[0].trim().slice(0, 100) : null,
    duration_ms: duration,
  })
  let warning: string | undefined
  if (insertError) {
    if (!isMissingTableError(insertError)) {
      console.error('[saveLesson] insert failed', { clipId, code: insertError.code, message: insertError.message })
      return { error: 'Could not save this lesson. Please try again.' }
    }
    console.error('[saveLesson] public.lessons missing; apply supabase/migrations/025_lessons.sql')
    warning = LESSONS_MISSING_MESSAGE
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
  let clipId: string, mediaPath: string, legacy = false
  if (lessonId.startsWith('legacy:')) {
    clipId = lessonId.slice('legacy:'.length)
    const { data } = await db.from('clips').select('lesson_path').eq('id', clipId).maybeSingle()
    const p = (data as { lesson_path?: string | null } | null)?.lesson_path
    if (!p) return { error: 'Lesson not found' }
    mediaPath = p; legacy = true
  } else {
    const { data, error } = await db.from('lessons').select('clip_id, media_path').eq('id', lessonId).maybeSingle()
    if (error && isMissingTableError(error)) return { error: 'Lesson not found' }
    const row = data as { clip_id: string; media_path: string } | null
    if (!row) return { error: 'Lesson not found' }
    clipId = row.clip_id; mediaPath = row.media_path
  }
  const access = await decideStorageAccess(client, userId, 'lessons', mediaPath, 'write')
  if (!access.allowed) {
    console.warn('[deleteLesson] denied', { userId, lessonId, reason: access.reason })
    return { error: LESSON_DENIED }
  }
  const { error: removeError } = await db.storage.from('lessons').remove([mediaPath])
  if (removeError) {
    console.error('[deleteLesson] storage remove failed', { lessonId, message: removeError.message })
    return { error: 'Could not delete this lesson. Please try again.' }
  }
  if (!legacy) {
    const { error } = await db.from('lessons').delete().eq('id', lessonId)
    if (error) return { error: 'Could not delete this lesson. Please try again.' }
  }
  // Keep clips.lesson_path pointing at the newest remaining lesson (or none).
  const { data: clipRow } = await db.from('clips').select('lesson_path').eq('id', clipId).maybeSingle()
  if ((clipRow as { lesson_path?: string | null } | null)?.lesson_path === mediaPath) {
    let next: string | null = null
    if (!legacy) {
      const { data: newest } = await db.from('lessons').select('media_path').eq('clip_id', clipId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      next = (newest as { media_path?: string } | null)?.media_path ?? null
    }
    await db.from('clips').update({ lesson_path: next }).eq('id', clipId)
  }
  return { success: true, clipId }
}
