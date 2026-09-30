/**
 * Lesson history: grouping, formatting, loading and the service-role write rules.
 * Run with: npx tsx --test src/lib/__tests__/lessons.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLessonDuration, groupLessonsByClip, isMissingTableError, loadLessons, LESSONS_MISSING_MESSAGE, type LessonRow } from '../lessons'
import { deleteLessonRecord, saveLessonRecord, LESSON_DENIED } from '../lessons-write'
import { newLessonPath } from '../lesson-path'
import { fakeSupabase, type FakeTables } from './helpers/fake-supabase'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'
const C2 = '44444444-4444-4444-8444-444444444444'
const COACH = 'u-coach', ASST = 'u-asst', OFF = 'u-off', PLAYER = 'u-player', GUARD = 'u-guard'

function world(): FakeTables {
  return {
    players: [
      { id: P1, coach_id: COACH, user_id: PLAYER, guardian_id: 'g1', team_id: null },
      { id: P2, coach_id: OFF, user_id: null, guardian_id: null, team_id: null },
    ],
    guardians: [{ id: 'g1', user_id: GUARD }],
    player_teams: [{ player_id: P1, team_id: 'T' }],
    team_coaches: [{ team_id: 'T', coach_id: COACH, role: 'organizer' }, { team_id: 'T', coach_id: ASST, role: 'assistant' }],
    clips: [
      { id: C1, player_id: P1, title: 'Bullpen', session_date: '2026-09-20', created_at: '2026-09-20T10:00:00Z', lesson_path: null },
      { id: C2, player_id: P1, title: 'Game', session_date: null, created_at: '2026-09-25T10:00:00Z', lesson_path: null },
    ],
    lessons: [],
    profiles: [{ id: COACH, full_name: 'Coach Nolan' }, { id: ASST, full_name: 'Asst Sam' }],
  }
}
const L = (id: string, clip: string, at: string, coach: string | null = COACH): LessonRow =>
  ({ id, clip_id: clip, player_id: P1, coach_id: coach, media_path: `${P1}/${clip}/lesson-${id}-a.webm`, mime: 'video/webm', duration_ms: 10000, created_at: at })

test('groupLessonsByClip: clips by newest lesson, lessons newest first, coach names', () => {
  const clips = [
    { id: C1, title: 'Bullpen', session_date: '2026-09-20', created_at: '2026-09-20T10:00:00Z' },
    { id: C2, title: 'Game', session_date: null, created_at: '2026-09-25T10:00:00Z' },
  ]
  const g = groupLessonsByClip([L('1', C1, '2026-09-21T00:00:00Z'), L('2', C2, '2026-09-26T00:00:00Z'), L('3', C1, '2026-09-28T00:00:00Z', ASST), L('4', 'gone', '2026-09-29T00:00:00Z')], clips, { [COACH]: 'Coach Nolan', [ASST]: 'Asst Sam' })
  assert.deepEqual(g.map(x => x.clip.id), [C1, C2])
  assert.deepEqual(g[0].lessons.map(l => l.id), ['3', '1'])
  assert.equal(g[0].lessons[0].coach_name, 'Asst Sam')
  assert.equal(g.flatMap(x => x.lessons).length, 3)   // lesson on an unknown clip dropped
})

test('formatLessonDuration and isMissingTableError', () => {
  assert.equal(formatLessonDuration(9400), '0:09')
  assert.equal(formatLessonDuration(65_000), '1:05')
  assert.equal(formatLessonDuration(null), null)
  assert.equal(formatLessonDuration(-1), null)
  assert.equal(isMissingTableError({ code: 'PGRST205', message: '' }), true)
  assert.equal(isMissingTableError({ code: '42P01', message: 'relation "lessons" does not exist' }), true)
  assert.equal(isMissingTableError({ code: '23505', message: 'duplicate' }), false)
})

test('save: direct coach adds a row, keeps older lessons and files, points clips.lesson_path at the newest', async () => {
  const f = fakeSupabase(world())
  const first = newLessonPath(P1, C1, 'video/webm', 1, 'aaa')
  const second = newLessonPath(P1, C1, 'video/webm', 2, 'bbb')
  assert.deepEqual(await saveLessonRecord(f.client, COACH, C1, first, { mime: 'video/webm;codecs=vp9', durationMs: 9876.4 }), { success: true })
  assert.deepEqual(await saveLessonRecord(f.client, COACH, C1, second), { success: true })
  const rows = f.tables.lessons as Record<string, unknown>[]
  assert.equal(rows.length, 2)
  assert.deepEqual({ ...rows[0], id: undefined, created_at: undefined }, { id: undefined, created_at: undefined, clip_id: C1, player_id: P1, coach_id: COACH, media_path: first, mime: 'video/webm', duration_ms: 9876 })
  assert.equal((f.tables.clips as Record<string, unknown>[])[0].lesson_path, second)
  assert.deepEqual(f.removed, [])   // never deletes older lesson files
})

test('save: team assistant allowed; player, guardian, off-team coach and signed-out denied', async () => {
  const path = newLessonPath(P1, C1, 'video/mp4')
  assert.deepEqual(await saveLessonRecord(fakeSupabase(world()).client, ASST, C1, path), { success: true })
  for (const who of [PLAYER, GUARD, OFF]) {
    const f = fakeSupabase(world())
    assert.deepEqual(await saveLessonRecord(f.client, who, C1, path), { error: LESSON_DENIED }, who)
    assert.equal((f.tables.lessons as unknown[]).length, 0)
  }
  assert.deepEqual(await saveLessonRecord(fakeSupabase(world()).client, null, C1, path), { error: 'Not authenticated' })
})

test('save: path must be a lesson file for this player and clip', async () => {
  for (const bad of [`${P2}/${C1}/lesson.webm`, `${P1}/${C2}/lesson.webm`, `${P1}/${C1}/../x/lesson.webm`, `${P1}/${C1}/voice.webm`]) {
    assert.deepEqual(await saveLessonRecord(fakeSupabase(world()).client, COACH, C1, bad), { error: 'Invalid lesson file' }, bad)
  }
  assert.deepEqual(await saveLessonRecord(fakeSupabase(world()).client, COACH, 'nope', `${P1}/${C1}/lesson.webm`), { error: 'Clip not found' })
})

test('save: lessons table missing (025 not applied) -> saved to clips.lesson_path with a clear warning', async () => {
  const w = world(); w.lessons = 'missing'
  const f = fakeSupabase(w)
  const path = newLessonPath(P1, C1, 'video/webm')
  assert.deepEqual(await saveLessonRecord(f.client, COACH, C1, path), { success: true, warning: LESSONS_MISSING_MESSAGE })
  assert.equal((f.tables.clips as Record<string, unknown>[])[0].lesson_path, path)
})

test('save: other insert errors fail without touching clips.lesson_path', async () => {
  const f = fakeSupabase(world(), { failInsert: { lessons: { code: '23505', message: 'duplicate key' } } })
  const r = await saveLessonRecord(f.client, COACH, C1, newLessonPath(P1, C1, 'video/webm'))
  assert.ok('error' in r)
  assert.equal((f.tables.clips as Record<string, unknown>[])[0].lesson_path, null)
})

test('save: team_coaches missing (018 not applied) -> assistant denied, direct coach still works', async () => {
  const w = world(); w.team_coaches = 'missing'
  const path = newLessonPath(P1, C1, 'video/webm')
  assert.deepEqual(await saveLessonRecord(fakeSupabase(w).client, ASST, C1, path), { error: LESSON_DENIED })
  const w2 = world(); w2.team_coaches = 'missing'
  assert.deepEqual(await saveLessonRecord(fakeSupabase(w2).client, COACH, C1, path), { success: true })
})

test('delete: coach removes that lesson and file; clips.lesson_path falls back to the newest remaining', async () => {
  const f = fakeSupabase(world())
  const a = newLessonPath(P1, C1, 'video/webm', 1, 'a'), b = newLessonPath(P1, C1, 'video/webm', 2, 'b')
  await saveLessonRecord(f.client, COACH, C1, a)
  await saveLessonRecord(f.client, COACH, C1, b)
  const rows = f.tables.lessons as Record<string, unknown>[]
  const idB = rows.find(r => r.media_path === b)!.id as string
  assert.deepEqual(await deleteLessonRecord(f.client, PLAYER, idB), { error: LESSON_DENIED })
  assert.deepEqual(await deleteLessonRecord(f.client, COACH, idB), { success: true, clipId: C1 })
  assert.deepEqual(f.removed, [`lessons:${b}`])
  assert.deepEqual((f.tables.lessons as Record<string, unknown>[]).map(r => r.media_path), [a])
  assert.equal((f.tables.clips as Record<string, unknown>[])[0].lesson_path, a)
})

test('loadLessons: by player and clip with coach names; falls back to clips.lesson_path when the table is missing', async () => {
  const w = world()
  w.lessons = [L('1', C1, '2026-09-21T00:00:00Z'), L('2', C2, '2026-09-26T00:00:00Z', ASST), { ...L('9', C1, '2026-09-27T00:00:00Z'), player_id: P2 }]
  const byPlayer = await loadLessons(fakeSupabase(w).client, { playerId: P1 })
  assert.deepEqual(byPlayer.lessons.map(l => [l.id, l.coach_name]), [['2', 'Asst Sam'], ['1', 'Coach Nolan']])
  assert.equal(byPlayer.legacy, false)
  assert.equal(byPlayer.clips.length, 2)
  const byClip = await loadLessons(fakeSupabase(w).client, { clipId: C1 })
  assert.deepEqual(byClip.lessons.map(l => l.id), ['9', '1'])

  const w2 = world(); w2.lessons = 'missing'
  ;(w2.clips as Record<string, unknown>[])[0].lesson_path = `${P1}/${C1}/lesson.webm`
  const legacy = await loadLessons(fakeSupabase(w2).client, { playerId: P1 })
  assert.equal(legacy.legacy, true)
  assert.deepEqual(legacy.lessons.map(l => [l.id, l.media_path]), [[`legacy:${C1}`, `${P1}/${C1}/lesson.webm`]])
})
