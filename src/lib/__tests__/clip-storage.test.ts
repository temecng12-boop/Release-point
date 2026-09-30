/**
 * Tests for clip file cleanup paths (RP-041).
 * Run with: npx tsx src/lib/__tests__/clip-storage.test.ts
 */

import { clipFilesToRemove } from '../clip-storage'

let passed = 0
let failed = 0
function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) { console.log(`  ✓  ${label}`); passed++ }
  else { console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`); failed++ }
}

const P = 'bbbbbbbb-0000-4000-8000-000000000001'
const Q = 'bbbbbbbb-0000-4000-8000-000000000002'

console.log('\n── clipFilesToRemove ───────────────────────────────────────────')
{
  const out = clipFilesToRemove(P, [`${P}/video.mp4`, `${P}/voice.webm`])
  assert(JSON.stringify(out) === JSON.stringify([`${P}/video.mp4`, `${P}/voice.webm`]), 'video and voice note are removed')
}
assert(clipFilesToRemove(P, [null, undefined, '']).length === 0, 'missing paths: nothing to remove')
assert(JSON.stringify(clipFilesToRemove(P, [`${P}/a.mp4`, `${P}/a.mp4`])) === JSON.stringify([`${P}/a.mp4`]), 'duplicates collapse')
assert(clipFilesToRemove(P, [`${Q}/video.mp4`]).length === 0, "another player's file is never removed")
assert(clipFilesToRemove(P, [`${P}/../${Q}/video.mp4`]).length === 0, 'path traversal is skipped')
assert(clipFilesToRemove(P, [`${P}/`, `${P}`, `/${P}/x.mp4`, `${P}//x.mp4`]).length === 0, 'bare folder, leading slash and empty segments are skipped')
assert(clipFilesToRemove('', [`${P}/x.mp4`]).length === 0, 'no player id: nothing removed')

const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
