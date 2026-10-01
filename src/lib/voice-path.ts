// Storage path for a clip's coach voice note (clips bucket):
// <playerId>/<clipId>/voice.<ext>, as written by src/app/clips/[id]/voice-note.tsx.

const VOICE_FILE_RE = /^voice\.(webm|mp4|m4a)$/

/** True if `path` is the voice note file for exactly this player and clip. */
export function isVoicePathFor(path: unknown, playerId: string, clipId: string): boolean {
  if (typeof path !== 'string' || !playerId || !clipId) return false
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === playerId && parts[1] === clipId && VOICE_FILE_RE.test(parts[2])
}

// Timestamp voice notes: the note body is `__voice__:<playerId>/<clipId>/ts_voice/<uid>.<ext>`.
const TS_VOICE_FILE_RE = /^[A-Za-z0-9]+\.(webm|mp4|m4a)$/

/** The storage path of a timestamp voice note body, only if it sits under exactly this player and clip. */
export function timestampVoicePathFor(body: unknown, playerId: string, clipId: string): string | null {
  if (typeof body !== 'string' || !body.startsWith('__voice__:') || !playerId || !clipId) return null
  const path = body.slice('__voice__:'.length)
  const parts = path.split('/')
  const ok = parts.length === 4 && parts[0] === playerId && parts[1] === clipId && parts[2] === 'ts_voice' && TS_VOICE_FILE_RE.test(parts[3])
  return ok ? path : null
}
