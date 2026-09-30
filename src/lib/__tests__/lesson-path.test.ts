/**
 * Run with: npx tsx --test src/lib/__tests__/lesson-path.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLessonPathFor, lessonExtension, newLessonPath } from '../lesson-path'
import { parseStoragePath } from '../storage-access'

const P = '11111111-1111-4111-8111-111111111111'
const C = '33333333-3333-4333-8333-333333333333'
const OTHER = '22222222-2222-4222-8222-222222222222'

test('a second recording on the same clip gets a different path (no collision)', () => {
  const first = newLessonPath(P, C, 'video/webm;codecs=vp9,opus', 1727650000000, 'abc123')
  const second = newLessonPath(P, C, 'video/webm;codecs=vp9,opus', 1727650010000, 'def456')
  assert.notEqual(first, second)
  // same millisecond still differs by the random part
  assert.notEqual(newLessonPath(P, C, 'video/webm', 1, 'aaaa'), newLessonPath(P, C, 'video/webm', 1, 'bbbb'))
  // default arguments produce distinct paths too
  assert.notEqual(newLessonPath(P, C, 'video/webm'), newLessonPath(P, C, 'video/webm'))
})

test('path format: player folder first, clip folder, lesson-<stamp>-<rand>.<ext>', () => {
  assert.equal(newLessonPath(P, C, 'video/mp4', 1727650000000, 'Ab_C9'), `${P}/${C}/lesson-1727650000000-abc9.mp4`)
  assert.equal(lessonExtension('video/mp4;codecs=avc1'), 'mp4')
  assert.equal(lessonExtension('video/webm'), 'webm')
})

test('new paths pass the signed-URL ownership parser and map to the player (3b folder check)', () => {
  const p = newLessonPath(P, C, 'video/mp4')
  assert.deepEqual(parseStoragePath(p), { ok: true, playerId: P })
  assert.equal(p.split('/')[0], P)   // storage.foldername(name)[1] in the 3b policy
})

test('isLessonPathFor accepts old and new names for this clip only', () => {
  assert.equal(isLessonPathFor(`${P}/${C}/lesson.webm`, P, C), true)
  assert.equal(isLessonPathFor(`${P}/${C}/lesson.mp4`, P, C), true)
  assert.equal(isLessonPathFor(newLessonPath(P, C, 'video/webm'), P, C), true)
  for (const bad of [
    `${OTHER}/${C}/lesson.webm`, `${P}/${OTHER}/lesson.webm`, `${P}/${C}/voice.webm`, `${P}/${C}/lesson.exe`,
    `${P}/${C}/../lesson.webm`, `${P}/${C}/x/lesson.webm`, `${P}/lesson.webm`, '', null, 42,
  ]) assert.equal(isLessonPathFor(bad, P, C), false, String(bad))
})

test('deleteClip removes the lesson recording from the lessons bucket, not clips', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/actions/clips.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function deleteClip'), src.indexOf('export async function savePhaseChecklist'))
  assert.match(fn, /isLessonPathFor\(lessonPath, clip\.player_id as string, clipId\)/)
  assert.match(fn, /storage\.from\('lessons'\)\.remove\(\[lessonPath\]\)/)
  assert.doesNotMatch(fn, /clipFilesToRemove\([^)]*lessonPath/)
})
