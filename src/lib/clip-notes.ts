// Validation for a clip's coach notes (clips.notes), RP-041/RP-043. Pure;
// shared by the saveClipNotes server action and its tests.

export const CLIP_NOTES_MAX_LENGTH = 20000

/**
 * Normalizes the notes text sent by the client. Blank text clears the notes
 * (stored as null). Returns a user-facing error for non-strings or text over
 * the limit.
 */
export function normalizeClipNotes(value: unknown): { ok: true; notes: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, notes: null }
  if (typeof value !== 'string') return { ok: false, error: 'Invalid notes.' }
  if (value.length > CLIP_NOTES_MAX_LENGTH) {
    return { ok: false, error: `Notes are too long (max ${CLIP_NOTES_MAX_LENGTH.toLocaleString('en-US')} characters).` }
  }
  return { ok: true, notes: value.trim() === '' ? null : value }
}

export const CLIP_NOTES_CONFLICT_ERROR = 'This note changed elsewhere. Reload to see the latest.'

/**
 * Stale-write guard for coach notes (QA-002). The client sends the notes it
 * last loaded or saved (`expected`); if the stored notes (`current`) differ,
 * the write is stale and must be refused. Blank and null compare equal.
 * `expected === undefined` means the client sent no baseline (not checked).
 */
export function isStaleClipNotesWrite(current: string | null | undefined, expected: string | null | undefined): boolean {
  if (expected === undefined) return false
  const norm = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v : null)
  return norm(current) !== norm(expected)
}
