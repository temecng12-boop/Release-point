// Atomic coach-notes write (compare-and-swap on the notes text; no version
// column, no migration). Shared by the saveClipNotes server action and tests.
import { CLIP_NOTES_CONFLICT_ERROR, isStaleClipNotesWrite, sameClipNotes } from './clip-notes'

type DbError = { message: string; code?: string } | null
type Filter = {
  eq(c: string, v: string): Filter
  is(c: string, v: null): Filter
  select(c: string): PromiseLike<{ data: unknown[] | null; error: DbError }>
}
type Client = {
  from(t: string): {
    update(v: Record<string, unknown>): Filter
    select(c: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: DbError }> } }
  }
}

export type ClipNotesWriteResult =
  | { ok: true; notes: string | null; recovered?: true }
  | { ok: false; conflict: true; error: string; current: string | null }
  | { ok: false; conflict?: undefined; dbError: DbError | 'missing' }

/**
 * `current` is the stored notes as just read; `next` is normalized; `expected`
 * is the client's baseline (undefined = legacy client, no check).
 *
 * - The UPDATE only matches if the row still holds exactly `current`
 *   (`.eq('notes', current)`, or `IS NULL`), so a write racing between the
 *   read and the write can't be overwritten. 0 rows updated = conflict.
 * - Stale baseline or 0 rows: the note is reread; if it already equals `next`
 *   (an earlier save committed but its response was lost) that is a success.
 */
export async function writeClipNotesAtomic(client: unknown, clipId: string, current: string | null, next: string | null, expected: string | null | undefined): Promise<ClipNotesWriteResult> {
  const db = client as Client
  if (isStaleClipNotesWrite(current, expected)) return settle(current)

  let q = db.from('clips').update({ notes: next }).eq('id', clipId)
  q = current === null ? q.is('notes', null) : q.eq('notes', current)
  const { data, error } = await q.select('id')
  if (error) return { ok: false, dbError: error }
  if (data && data.length > 0) return { ok: true, notes: next }

  // 0 rows: the note changed after our read (or the clip is gone). Reread.
  const { data: row, error: readError } = await db.from('clips').select('notes').eq('id', clipId).maybeSingle()
  if (readError) return { ok: false, dbError: readError }
  if (!row) return { ok: false, dbError: 'missing' }
  return settle((row as { notes: string | null }).notes ?? null)

  function settle(stored: string | null): ClipNotesWriteResult {
    if (sameClipNotes(stored, next)) return { ok: true, notes: stored, recovered: true }
    return { ok: false, conflict: true, error: CLIP_NOTES_CONFLICT_ERROR, current: stored }
  }
}
