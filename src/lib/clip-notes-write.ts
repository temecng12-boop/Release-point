// Atomic coach-notes write. The compare-and-swap runs in Postgres
// (save_clip_notes, migration 027): the app sends md5 of the note it read, so
// the old note never travels in a request URL (long/accented notes got a 400
// from PostgREST when it was an .eq() filter). Shared by saveClipNotes and tests.
import { createHash } from 'node:crypto'
import { CLIP_NOTES_CONFLICT_ERROR, isStaleClipNotesWrite, sameClipNotes } from './clip-notes'

type DbError = { message: string; code?: string } | null
type RpcRow = { saved: boolean; clip_found: boolean; current_notes: string | null }
type Rpc = (fn: 'save_clip_notes', args: { p_clip_id: string; p_expected_md5: string; p_new_notes: string | null }) => PromiseLike<{ data: unknown; error: DbError }>
type Filter = {
  eq(c: string, v: string): Filter
  is(c: string, v: null): Filter
  select(c: string): PromiseLike<{ data: unknown[] | null; error: DbError }>
}
type LegacyClient = {
  from(t: string): {
    update(v: Record<string, unknown>): Filter
    select(c: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: DbError }> } }
  }
}

export type ClipNotesWriteResult =
  | { ok: true; notes: string | null; recovered?: true }
  | { ok: false; conflict: true; error: string; current: string | null }
  | { ok: false; conflict?: undefined; dbError: DbError | 'missing' }

/** md5 hex of the note as Postgres computes md5(coalesce(notes, '')) (UTF-8). */
export function clipNotesMd5(notes: string | null | undefined): string {
  return createHash('md5').update(notes ?? '', 'utf8').digest('hex')
}

// Before 027 is applied: the old .eq() compare-and-swap, only while the note
// is short enough for a URL filter.
export const LEGACY_FILTER_MAX = 4000
export const NOTES_RPC_MISSING = 'Could not save notes: the database needs migration 027 (save_clip_notes).'

function isMissingRpc(e: DbError): boolean {
  return !!e && (e.code === 'PGRST202' || e.code === '42883' || /save_clip_notes/.test(e.message) && /not find|does not exist/i.test(e.message))
}

/**
 * `rpc` must be the caller's own (session) client so RLS decides who may
 * update; `current` is the stored note as just read; `next` is normalized;
 * `expected` is the client's baseline (undefined = legacy client, no check).
 * A stale baseline or an update that matched nothing settles against the
 * stored note: equal to `next` means an earlier save already committed (its
 * response was lost), so that counts as success; otherwise it's a conflict.
 */
export async function writeClipNotesAtomic(
  deps: { rpc: Rpc; legacy?: unknown },
  clipId: string, current: string | null, next: string | null, expected: string | null | undefined,
): Promise<ClipNotesWriteResult> {
  if (isStaleClipNotesWrite(current, expected)) return settle(current, next)

  const { data, error } = await deps.rpc('save_clip_notes', { p_clip_id: clipId, p_expected_md5: clipNotesMd5(current), p_new_notes: next })
  if (error) {
    if (isMissingRpc(error) && deps.legacy) return legacyWrite(deps.legacy, clipId, current, next)
    return { ok: false, dbError: isMissingRpc(error) ? { message: NOTES_RPC_MISSING, code: error.code } : error }
  }
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
  if (!row || !row.clip_found) return { ok: false, dbError: 'missing' }
  if (row.saved) return { ok: true, notes: row.current_notes ?? null }
  return settle(row.current_notes ?? null, next)
}

function settle(stored: string | null, next: string | null): ClipNotesWriteResult {
  if (sameClipNotes(stored, next)) return { ok: true, notes: stored, recovered: true }
  return { ok: false, conflict: true, error: CLIP_NOTES_CONFLICT_ERROR, current: stored }
}

async function legacyWrite(client: unknown, clipId: string, current: string | null, next: string | null): Promise<ClipNotesWriteResult> {
  console.error('[saveClipNotes] save_clip_notes RPC missing; apply supabase/migrations/027_save_clip_notes.sql')
  if (current !== null && encodeURIComponent(current).length > LEGACY_FILTER_MAX) return { ok: false, dbError: { message: NOTES_RPC_MISSING } }
  const db = client as LegacyClient
  let q = db.from('clips').update({ notes: next }).eq('id', clipId)
  q = current === null ? q.is('notes', null) : q.eq('notes', current)
  const { data, error } = await q.select('id')
  if (error) return { ok: false, dbError: error }
  if (data && data.length > 0) return { ok: true, notes: next }
  const { data: row, error: readError } = await db.from('clips').select('notes').eq('id', clipId).maybeSingle()
  if (readError) return { ok: false, dbError: readError }
  if (!row) return { ok: false, dbError: 'missing' }
  return settle((row as { notes: string | null }).notes ?? null, next)
}
