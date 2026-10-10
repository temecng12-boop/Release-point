// Removing a clip's coach voice note (clips bucket) or lesson recording
// (lessons bucket): the player's direct coach or a coach on a team that
// includes the player, the same rule as saving them. The player and
// guardians can't. Files are removed only if the stored path is that
// player's/clip's own voice or lesson file.
import { canCoachWriteForPlayerWith } from './auth/coach-write-access'
import type { AccessDb } from './clip-access'
import { isLessonPathFor } from './lesson-path'
import { isVoicePathFor } from './voice-path'

type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>
type Client = {
  from(t: string): {
    select(c: string): { eq(c: string, v: string): { maybeSingle(): Res } }
    update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<{ error: { message: string } | null }> }
  }
  storage: { from(b: string): { remove(p: string[]): PromiseLike<{ error: { message: string } | null }> } }
}

const KINDS = {
  voice: { column: 'voice_path', bucket: 'clips', valid: isVoicePathFor },
  lesson: { column: 'lesson_path', bucket: 'lessons', valid: isLessonPathFor },
} as const

export const REMOVE_FAILED = {
  voice: 'Could not delete the voice note file. Please try again.',
  lesson: 'Could not delete the lesson file. Please try again.',
} as const

export async function removeClipMediaAsOwnCoach(client: unknown, userId: string | null | undefined, clipId: string, kind: keyof typeof KINDS): Promise<{ success: true; error?: undefined } | { error: string; success?: undefined }> {
  if (!userId) return { error: 'Not authenticated' }
  const db = client as Client
  const k = KINDS[kind]
  const { data: clip } = await db.from('clips').select(`player_id, ${k.column}`).eq('id', clipId).maybeSingle()
  const row = clip as Record<string, string | null> | null
  if (!row?.player_id) return { error: 'Clip not found' }
  if (!(await canCoachWriteForPlayerWith(client as AccessDb, userId, row.player_id))) return { error: 'Not authorized' }
  const path = row[k.column]
  if (path && k.valid(path, row.player_id, clipId)) {
    const { error } = await db.storage.from(k.bucket).remove([path])
    if (error) {
      // Keep the column pointing at the file so it isn't orphaned; the coach can retry.
      console.error(`[remove ${kind}] storage remove failed; ${k.column} kept`, { clipId, message: error.message })
      return { error: REMOVE_FAILED[kind] }
    }
  } else if (path) {
    console.warn(`[remove ${kind}] stored path is outside this clip's folder; file left in place`, { clipId })
  }
  const { error } = await db.from('clips').update({ [k.column]: null }).eq('id', clipId)
  if (error) return { error: error.message }
  return { success: true }
}
