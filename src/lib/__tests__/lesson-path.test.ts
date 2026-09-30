/**
 * Run with: npx tsx --test src/lib/__tests__/lesson-path.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLessonPathFor, lessonBaseMime, lessonExtension, lessonMimeMatchesPath, newLessonPath } from '../lesson-path'
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

test('audio lesson types: base type, extension and path match', () => {
  assert.equal(lessonBaseMime('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4')
  assert.equal(lessonBaseMime('Audio/WebM; codecs=opus'), 'audio/webm')
  assert.equal(lessonBaseMime('video/webm'), 'video/webm')
  assert.equal(lessonBaseMime('audio/mpeg'), null)
  assert.equal(lessonBaseMime(null), null)
  assert.equal(lessonExtension('audio/mp4'), 'mp4')
  assert.equal(lessonExtension('audio/aac'), 'mp4')
  assert.equal(lessonExtension('audio/webm;codecs=opus'), 'webm')
  assert.equal(lessonMimeMatchesPath('audio/mp4', 'p/c/lesson-1-a.mp4'), true)
  assert.equal(lessonMimeMatchesPath('audio/webm', 'p/c/lesson-1-a.webm'), true)
  assert.equal(lessonMimeMatchesPath('audio/webm', 'p/c/lesson-1-a.mp4'), false)
  assert.equal(lessonMimeMatchesPath('video/mp4', 'p/c/lesson.mp4'), true)
})

test('deleteClip removes the lesson recording from the lessons bucket, not clips', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/actions/clips.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function deleteClip'), src.indexOf('export async function savePhaseChecklist'))
  // Every lesson file of the clip (checked to be in this player's folder by
  // clipLessonFiles), removed from the lessons bucket; never from clips.
  assert.match(fn, /clipLessonFiles\(supabaseAdmin, clipId, clip\.player_id as string\)/)
  assert.match(fn, /storage\.from\('lessons'\)\.remove\(lessonFiles\)/)
  assert.doesNotMatch(fn, /clipFilesToRemove\([^)]*lesson/)
})
