/**
 * Atomic coach-notes write via the save_clip_notes RPC (027) + lost-response
 * recovery. The Postgres side is checked on PGlite (pgcheck-demo/tnotes027.mts).
 * Run with: npx tsx --test src/lib/__tests__/clip-notes-write.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { clipNotesMd5, writeClipNotesAtomic, NOTES_RPC_MISSING } from '../clip-notes-write'
import { recoverClipNotesBaseline, CLIP_NOTES_CONFLICT_ERROR, CLIP_NOTES_MAX_LENGTH } from '../clip-notes'

const C = '33333333-3333-4333-8333-333333333333'
// ~115 KB once URL-encoded: the size that used to get a 400.
const LONG = ('éèêëàâäôöûüçñÉÅ “déjà” ✓€ ').repeat(800).slice(0, CLIP_NOTES_MAX_LENGTH - 10)
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')

// In-memory stand-in for the RPC with the same compare-and-swap rule.
function fakeRpc(notes: string | null, opts: { before?: (row: { notes: string | null }) => void; visible?: boolean } = {}) {
  const row = { notes }, calls: Record<string, unknown>[] = []
  const rpc = async (_fn: string, a: { p_clip_id: string; p_expected_md5: string; p_new_notes: string | null }) => {
    calls.push(a)
    opts.before?.(row)
    if (opts.visible === false) return { data: [{ saved: false, clip_found: false, current_notes: null }], error: null }
    if (md5(row.notes ?? '') !== a.p_expected_md5) return { data: [{ saved: false, clip_found: true, current_notes: row.notes }], error: null }
    row.notes = a.p_new_notes
    return { data: [{ saved: true, clip_found: true, current_notes: row.notes }], error: null }
  }
  return { rpc, row, calls }
}

test('md5 matches Postgres md5(coalesce(notes, "")) conventions', () => {
  assert.equal(clipNotesMd5(null), 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(clipNotesMd5(''), clipNotesMd5(null))
  assert.equal(clipNotesMd5('é'), md5('é'))
})

test('saves through the RPC with md5 of the note that was read', async () => {
  const f = fakeRpc('old')
  assert.deepEqual(await writeClipNotesAtomic({ rpc: f.rpc }, C, 'old', 'new', 'old'), { ok: true, notes: 'new' })
  assert.deepEqual(f.calls, [{ p_clip_id: C, p_expected_md5: md5('old'), p_new_notes: 'new' }])
})

test('long accented note: nothing large goes in the request URL (real PostgREST client, as supabase.rpc uses)', async () => {
  const seen: { url: string; method: string; body: string }[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
    return new Response(JSON.stringify([{ saved: true, clip_found: true, current_notes: LONG + '!' }]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const sb = new PostgrestClient('http://127.0.0.1:59999/rest/v1', { fetch })
  const r = await writeClipNotesAtomic({ rpc: (fn, args) => sb.rpc(fn, args) }, C, LONG, LONG + '!', LONG)
  assert.deepEqual(r, { ok: true, notes: LONG + '!' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].method, 'POST')
  assert.ok(seen[0].url.length < 200, `URL is short (${seen[0].url.length})`)
  assert.ok(encodeURIComponent(LONG).length > 100_000)
  const body = JSON.parse(seen[0].body)
  assert.equal(body.p_expected_md5, md5(LONG))
  assert.equal(body.p_new_notes, LONG + '!')
})

test('mismatch = conflict; the newer note is kept and reported', async () => {
  const f = fakeRpc('old', { before: row => { row.notes = 'other tab' } })
  assert.deepEqual(await writeClipNotesAtomic({ rpc: f.rpc }, C, 'old', 'mine', 'old'), { ok: false, conflict: true, error: CLIP_NOTES_CONFLICT_ERROR, current: 'other tab' })
  assert.equal(f.row.notes, 'other tab')
})

test('stale baseline is refused without calling the RPC', async () => {
  const f = fakeRpc('newer')
  assert.equal((await writeClipNotesAtomic({ rpc: f.rpc }, C, 'newer', 'mine', 'old')).ok, false)
  assert.equal(f.calls.length, 0)
})

test('lost response: a retry finds its own text already saved -> success', async () => {
  const f = fakeRpc(LONG)   // the first save committed; the client still has the old baseline
  assert.deepEqual(await writeClipNotesAtomic({ rpc: f.rpc }, C, LONG, LONG, 'old'), { ok: true, notes: LONG, recovered: true })
  const g = fakeRpc('old', { before: row => { row.notes = 'same' } })
  assert.deepEqual(await writeClipNotesAtomic({ rpc: g.rpc }, C, 'old', 'same', 'old'), { ok: true, notes: 'same', recovered: true })
})

test('not visible to the caller (RLS) or missing -> not found', async () => {
  const f = fakeRpc('old', { visible: false })
  assert.deepEqual(await writeClipNotesAtomic({ rpc: f.rpc }, C, 'old', 'new', 'old'), { ok: false, dbError: 'missing' })
})

test('027 not applied: short notes use the old filter, long notes get a clear error', async () => {
  const missing = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_clip_notes' } })
  let url = ''
  const legacy = { from: () => ({
    update: () => { const q = { eq: (_c: string, v: string) => { url += v; return q }, is: () => q, select: async () => ({ data: [{ id: C }], error: null }) }; return q },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }) }
  const err = console.error; console.error = () => {}
  try {
    assert.deepEqual(await writeClipNotesAtomic({ rpc: missing, legacy }, C, 'old', 'new', 'old'), { ok: true, notes: 'new' })
    const r = await writeClipNotesAtomic({ rpc: missing, legacy }, C, LONG, 'new', LONG)
    assert.deepEqual(r, { ok: false, dbError: { message: NOTES_RPC_MISSING } })
    assert.ok(!url.includes(LONG))
  } finally { console.error = err }
})

test('client recovery: adopt the stored note as baseline only if it is what we tried to save', () => {
  assert.deepEqual(recoverClipNotesBaseline(LONG, LONG), { recovered: true, baseline: LONG })
  assert.deepEqual(recoverClipNotesBaseline(null, ''), { recovered: true, baseline: null })
  assert.deepEqual(recoverClipNotesBaseline('other', 'mine'), { recovered: false })
})
