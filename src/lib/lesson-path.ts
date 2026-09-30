// Storage paths for coach lesson recordings (lessons bucket).
//
// Each recording gets its own object: <playerId>/<clipId>/lesson-<stamp>-<rand>.<ext>.
// The old fixed name (<playerId>/<clipId>/lesson.<ext>) made every re-record
// on the same clip collide with the existing object, and signed upload URLs
// don't overwrite (upsert is false), so the second recording always failed.
// The first folder is still the player id, which the lessons bucket policy
// (3b) and the signed-URL ownership check (src/lib/storage-access.ts) rely on.

export type LessonExt = 'mp4' | 'webm'

export function lessonExtension(mimeType: string): LessonExt {
  return mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm'
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
