// Storage path for a clip's coach voice note (clips bucket):
// <playerId>/<clipId>/voice.<ext>, as written by src/app/clips/[id]/voice-note.tsx.

const VOICE_FILE_RE = /^voice\.(webm|mp4|m4a)$/

/** True if `path` is the voice note file for exactly this player and clip. */
export function isVoicePathFor(path: unknown, playerId: string, clipId: string): boolean {
  if (typeof path !== 'string' || !playerId || !clipId) return false
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === playerId && parts[1] === clipId && VOICE_FILE_RE.test(parts[2])
}
