// Storage paths for coach lesson recordings (lessons bucket).
//
// Each recording gets its own object: <playerId>/<clipId>/lesson-<stamp>-<rand>.<ext>.
// The old fixed name (<playerId>/<clipId>/lesson.<ext>) made every re-record
// on the same clip collide with the existing object, and signed upload URLs
// don't overwrite (upsert is false), so the second recording always failed.
// The first folder is still the player id, which the lessons bucket policy
// (3b) and the signed-URL ownership check (src/lib/storage-access.ts) rely on.

export type LessonExt = 'mp4' | 'webm'

const MP4_FAMILY = ['video/mp4', 'video/x-m4v', 'audio/mp4', 'audio/aac', 'audio/x-m4a']

/** Media types the lessons bucket accepts (016 video types + 026 audio types), as base types. */
export const LESSON_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm', 'audio/ogg'] as const

/** "audio/mp4;codecs=mp4a.40.2" -> "audio/mp4" if the lessons bucket accepts it, else null. */
export function lessonBaseMime(mime: unknown): string | null {
  if (typeof mime !== 'string') return null
  const base = mime.split(';')[0].trim().toLowerCase()
  return (LESSON_MIME_TYPES as readonly string[]).includes(base) ? base : null
}

export function lessonExtension(mimeType: string): LessonExt {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  return MP4_FAMILY.includes(base) || base.includes('mp4') ? 'mp4' : 'webm'
}

/** The file extension matches the media type's container (e.g. audio/mp4 -> .mp4, audio/webm -> .webm). */
export function lessonMimeMatchesPath(mime: string, path: string): boolean {
  const base = lessonBaseMime(mime)
  const ext = path.split('.').pop()?.toLowerCase()
  if (!base || !ext) return false
  if (MP4_FAMILY.includes(base)) return ext === 'mp4' || ext === 'm4v'
  if (base === 'video/webm' || base === 'audio/webm') return ext === 'webm'
  if (base === 'video/quicktime') return ext === 'mov'
  return false
}

export function newLessonPath(
  playerId: string,
  clipId: string,
  mimeType: string,
  stamp: number = Date.now(),
  rand: string = Math.random().toString(36).slice(2, 8),
): string {
  const safeRand = rand.toLowerCase().replace(/[^a-z0-9]/g, '') || '0'
  return `${playerId}/${clipId}/lesson-${Math.max(0, Math.floor(stamp))}-${safeRand}.${lessonExtension(mimeType)}`
}

const LESSON_FILE_RE = /^lesson(-[0-9]+-[a-z0-9]+)?\.(mp4|webm|mov|m4v)$/

/** True if `path` is a lesson recording (old or new naming) for exactly this player and clip. */
export function isLessonPathFor(path: unknown, playerId: string, clipId: string): boolean {
  if (typeof path !== 'string' || !playerId || !clipId) return false
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === playerId && parts[1] === clipId && LESSON_FILE_RE.test(parts[2])
}
