/**
 * Tests for clip notes validation (RP-041/RP-043). No Supabase.
 * Run with: npx tsx src/lib/__tests__/clip-notes.test.ts
 */

import { normalizeClipNotes, CLIP_NOTES_MAX_LENGTH } from '../clip-notes'

let passed = 0
let failed = 0
function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) { console.log(`  ✓  ${label}`); passed++ }
  else { console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`); failed++ }
}

console.log('\n── normalizeClipNotes ──────────────────────────────────────────')
{
  const r = normalizeClipNotes('Stay tall through release')
  assert(r.ok && r.notes === 'Stay tall through release', 'text is kept as written')
}
{
  const r = normalizeClipNotes('  line one\nline two  ')
  assert(r.ok && r.notes === '  line one\nline two  ', 'whitespace inside non-blank notes is kept')
}
{
  const r = normalizeClipNotes('')
  assert(r.ok && r.notes === null, 'empty text clears the notes (null)')
  const r2 = normalizeClipNotes('   \n ')
  assert(r2.ok && r2.notes === null, 'blank text clears the notes (null)')
  const r3 = normalizeClipNotes(null)
  assert(r3.ok && r3.notes === null, 'null clears the notes')
}
{
  const r = normalizeClipNotes(42)
  assert(!r.ok && r.error === 'Invalid notes.', 'non-string: rejected')
  const r2 = normalizeClipNotes({ notes: 'x' })
  assert(!r2.ok, 'object: rejected')
}
{
  assert(normalizeClipNotes('a'.repeat(CLIP_NOTES_MAX_LENGTH)).ok, 'at the length limit: accepted')
  const r = normalizeClipNotes('a'.repeat(CLIP_NOTES_MAX_LENGTH + 1))
  assert(!r.ok && r.error === 'Notes are too long (max 20,000 characters).', 'over the limit: rejected with the limit in the message', !r.ok ? r.error : '')
}

const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
