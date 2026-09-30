/**
 * Atomic coach-notes write + lost-response recovery.
 * Run with: npx tsx --test src/lib/__tests__/clip-notes-write.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeClipNotesAtomic } from '../clip-notes-write'
import { recoverClipNotesBaseline, CLIP_NOTES_CONFLICT_ERROR } from '../clip-notes'

const C = 'clip-1'
// Fake clips table with one row; `before` runs just before the UPDATE applies (a racing writer).
function db(notes: string | null, before?: (row: { notes: string | null }) => void) {
  const row = { id: C, notes }
  const log: string[] = []
  const client = {
    from: () => ({
      update: (v: { notes: string | null }) => {
        const f: [string, string, unknown][] = []
        const q = {
          eq: (c: string, val: string) => { f.push(['eq', c, val]); return q },
          is: (c: string, val: null) => { f.push(['is', c, val]); return q },
          select: async () => {
            before?.(row)
            log.push(`update ${JSON.stringify(f)}`)
            const hit = f.every(([op, c, val]) => op === 'eq' ? (row as Record<string, unknown>)[c] === val : (row as Record<string, unknown>)[c] === null)
            if (hit) row.notes = v.notes
            return { data: hit ? [{ id: C }] : [], error: null }
          },
        }
        return q
      },
      select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => { log.push('reread'); return { data: v === C ? { notes: row.notes } : null, error: null } } }) }),
    }),
  }
  return { client, row, log }
}

test('write is conditional on the notes the client saw (eq notes / is null)', async () => {
  const d = db('old')
  assert.deepEqual(await writeClipNotesAtomic(d.client, C, 'old', 'new', 'old'), { ok: true, notes: 'new' })
  assert.match(d.log[0], /\["eq","notes","old"\]/)
  assert.equal(d.row.notes, 'new')
  const e = db(null)
  assert.deepEqual(await writeClipNotesAtomic(e.client, C, null, 'first', null), { ok: true, notes: 'first' })
  assert.match(e.log[0], /\["is","notes",null\]/)
})

test('a write racing in between read and update: 0 rows = conflict, the other write is kept', async () => {
  const d = db('old', row => { row.notes = 'other tab' })
  const r = await writeClipNotesAtomic(d.client, C, 'old', 'mine', 'old')
  assert.deepEqual(r, { ok: false, conflict: true, error: CLIP_NOTES_CONFLICT_ERROR, current: 'other tab' })
  assert.equal(d.row.notes, 'other tab')
})

test('stale baseline is refused without writing', async () => {
  const d = db('newer')
  const r = await writeClipNotesAtomic(d.client, C, 'newer', 'mine', 'old')
  assert.equal(r.ok, false)
  assert.ok(!d.log.some(l => l.startsWith('update')))
})

test('lost response: retry with the old baseline succeeds when the note already equals what we saved', async () => {
  // First save committed ('old' -> 'mine') but the client never got the answer.
  const d = db('mine')
  assert.deepEqual(await writeClipNotesAtomic(d.client, C, 'mine', 'mine', 'old'), { ok: true, notes: 'mine', recovered: true })
  assert.ok(!d.log.some(l => l.startsWith('update')))
  // Identical text written concurrently also counts as success.
  const e = db('old', row => { row.notes = 'same' })
  assert.deepEqual(await writeClipNotesAtomic(e.client, C, 'old', 'same', 'old'), { ok: true, notes: 'same', recovered: true })
  // Clearing: null and blank are the same note.
  assert.equal((await writeClipNotesAtomic(db('  ').client, C, '  ', null, 'x')).ok, true)
})

test('missing clip after 0 rows', async () => {
  const d = db('old'); const r = await writeClipNotesAtomic(d.client, 'gone', 'old', 'new', 'old')
  assert.deepEqual(r, { ok: false, dbError: 'missing' })
})

test('client recovery: adopt the stored note as baseline only if it is what we tried to save', () => {
  assert.deepEqual(recoverClipNotesBaseline('mine', 'mine'), { recovered: true, baseline: 'mine' })
  assert.deepEqual(recoverClipNotesBaseline(null, ''), { recovered: true, baseline: null })
  assert.deepEqual(recoverClipNotesBaseline('other', 'mine'), { recovered: false })
})
