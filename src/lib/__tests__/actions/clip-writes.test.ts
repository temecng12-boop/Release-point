/**
 * Clip actions: failed writes come back as errors, storage cleanup failures
 * come back as warnings (the delete itself still stands), and Clear marks
 * reports which marks the server actually deleted.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/clip-writes.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { deleteClip, clearAnnotations, saveLessonPath, renameClip, deleteAnnotation, deleteTimestampNote } from '../../../app/actions/clips'

const P = '11111111-1111-4111-8111-111111111111'
const C = '33333333-3333-4333-8333-333333333333'
const COACH = { id: 'coach', email: 'coach@example.com' }
const VIDEO = `${P}/1700000000000.mp4`
const VOICE = `${P}/${C}/voice.webm`
const OLD_LESSON = `${P}/${C}/lesson-1-a.webm`
const NEW_LESSON = `${P}/${C}/lesson-2-b.webm`

function seed() {
  resetFake({
    user: COACH,
    tables: {
      clips: [{ id: C, player_id: P, title: 'Bullpen 1', storage_path: VIDEO, voice_path: VOICE, uploaded_by: COACH.id, lesson_path: OLD_LESSON }],
      // Confirmed 18+, so the consent gate (#17, src/lib/consent-server.ts) lets lesson saves through.
      players: [{ id: P, coach_id: COACH.id, user_id: 'player-user', guardian_id: null, team_id: null, adult_confirmed_at: '2026-01-01T00:00:00Z', consent_given_at: null }],
      annotations: [
        { id: 'a-mine-1', clip_id: C, created_by: COACH.id },
        { id: 'a-mine-2', clip_id: C, created_by: COACH.id },
        { id: 'a-player', clip_id: C, created_by: 'player-user' },
      ],
      timestamp_notes: [{ id: 'n1', clip_id: C }],
      pitch_metrics: [{ id: 'm1', clip_id: C }],
    },
    storage: { clips: [VIDEO, VOICE], lessons: [OLD_LESSON] },
  })
}

test('deleteClip: all good returns plain success and removes the files', async () => {
  seed()
  assert.deepEqual(await deleteClip(C), { success: true })
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage, { clips: [], lessons: [] })
})

test('deleteClip: clips-bucket cleanup fails -> clip still deleted, warning returned', async () => {
  seed()
  fail({ bucket: 'clips', error: { message: 'storage unavailable' } })
  const r = await deleteClip(C)
  assert.equal(r.success, true)
  assert.match(String((r as { warning?: string }).warning), /Clip deleted, but some of its files couldn't be cleaned up/)
  assert.equal(state.tables.clips.length, 0)
})

test('deleteClip: lessons-bucket cleanup fails -> warning returned', async () => {
  seed()
  fail({ bucket: 'lessons', error: { message: 'storage unavailable' } })
  const r = await deleteClip(C) as { success?: true; warning?: string }
  assert.equal(r.success, true)
  assert.ok(r.warning)
})

for (const table of ['annotations', 'timestamp_notes', 'pitch_metrics']) {
  test(`deleteClip: ${table} delete fails -> error, clip row and files kept`, async () => {
    seed()
    fail({ table, action: 'delete', error: { code: '57014', message: 'timeout' } })
    const r = await deleteClip(C)
    assert.ok('error' in r && r.error)
    assert.equal(state.tables.clips.length, 1)
    assert.deepEqual(state.storageOps, [])
  })
}

test('deleteClip: clip row delete fails -> error, no files removed', async () => {
  seed()
  fail({ table: 'clips', action: 'delete', error: { message: 'boom' } })
  assert.ok('error' in await deleteClip(C))
  assert.deepEqual(state.storageOps, [])
})

// D3: timestamp voice note files go with their notes.
const TS_VOICE = `${P}/${C}/ts_voice/abc123.webm`
const OTHER_P = '11111111-1111-4111-8111-111111111112'
const FOREIGN = `${OTHER_P}/${C}/ts_voice/zzz.webm`
function seedVoiceNotes() {
  seed()
  state.tables.timestamp_notes = [
    { id: 'n1', clip_id: C, created_by: COACH.id, body: `__voice__:${TS_VOICE}` },
    { id: 'n2', clip_id: C, created_by: COACH.id, body: `__voice__:${FOREIGN}` },   // not under this player: never removed
    { id: 'n3', clip_id: C, created_by: COACH.id, body: 'text note' },
  ]
  state.storage.clips.push(TS_VOICE, FOREIGN)
}

test('deleteClip: removes the clip\'s timestamp voice note files too, only under this player and clip', async () => {
  seedVoiceNotes()
  assert.deepEqual(await deleteClip(C), { success: true })
  assert.deepEqual(state.storage.clips, [FOREIGN])
})

// Lessons (#13) and storage cleanup (#39) both run in one deleteClip.
const LESSON_A = `${P}/${C}/lesson-3-c.webm`
const LESSON_B = `${P}/${C}/lesson-4-d.webm`
const FOREIGN_LESSON = `${OTHER_P}/${C}/lesson-5-e.webm`
function seedLessonsAndVoice() {
  seedVoiceNotes()
  state.tables.lessons = [
    { id: 'l1', clip_id: C, player_id: P, media_path: LESSON_A },
    { id: 'l2', clip_id: C, player_id: P, media_path: LESSON_B },
    { id: 'l3', clip_id: C, player_id: P, media_path: FOREIGN_LESSON },   // not under this player: never removed
  ]
  state.storage.lessons.push(LESSON_A, LESSON_B, FOREIGN_LESSON)
}

test('deleteClip: removes every lesson file AND the clip, voice and note recordings in one delete', async () => {
  seedLessonsAndVoice()
  assert.deepEqual(await deleteClip(C), { success: true })
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage.clips, [FOREIGN])
  assert.deepEqual(state.storage.lessons, [FOREIGN_LESSON])
  const removed = Object.fromEntries(state.storageOps.map(o => [o.bucket, [...o.paths].sort()]))
  assert.deepEqual(removed.clips, [VIDEO, VOICE, TS_VOICE].sort())
  assert.deepEqual(removed.lessons, [OLD_LESSON, LESSON_A, LESSON_B].sort())
})

test('deleteClip: lessons-bucket cleanup fails -> clips files still removed, warning returned', async () => {
  seedLessonsAndVoice()
  fail({ bucket: 'lessons', error: { message: 'storage unavailable' } })
  const r = await deleteClip(C) as { success?: true; warning?: string }
  assert.equal(r.success, true)
  assert.match(String(r.warning), /Clip deleted, but some of its files couldn't be cleaned up/)
  assert.deepEqual(state.storage.clips, [FOREIGN])
})

test('deleteClip: lessons can\'t be read -> error, nothing deleted, no files removed', async () => {
  seedLessonsAndVoice()
  fail({ table: 'lessons', action: 'select', error: { code: '57014', message: 'timeout' } })
  const orig = console.error
  console.error = () => {}
  let r: Awaited<ReturnType<typeof deleteClip>>
  try { r = await deleteClip(C) } finally { console.error = orig }
  assert.match(String((r as { error?: string }).error), /^Could not delete this clip\./)
  assert.equal(state.tables.clips.length, 1)
  assert.equal(state.tables.timestamp_notes.length, 3)
  assert.deepEqual(state.storageOps, [])
})

test('deleteTimestampNote: a voice note\'s file is removed after the row', async () => {
  seedVoiceNotes()
  assert.deepEqual(await deleteTimestampNote('n1'), { success: true })
  assert.deepEqual(state.tables.timestamp_notes.map(n => n.id), ['n2', 'n3'])
  assert.deepEqual(state.storageOps, [{ bucket: 'clips', paths: [TS_VOICE] }])
})

test('deleteTimestampNote: a path outside this player\'s clip folder or a text note removes no file', async () => {
  seedVoiceNotes()
  assert.deepEqual(await deleteTimestampNote('n2'), { success: true })
  assert.deepEqual(await deleteTimestampNote('n3'), { success: true })
  assert.deepEqual(state.storageOps, [])
})

test('deleteTimestampNote: file removal fails -> note deleted, warning returned', async () => {
  seedVoiceNotes()
  fail({ bucket: 'clips', error: { message: 'storage unavailable' } })
  const r = await deleteTimestampNote('n1') as { success?: true; warning?: string }
  assert.equal(r.success, true)
  assert.match(String(r.warning), /recording couldn't be removed/)
  assert.ok(state.storage.clips.includes(TS_VOICE))
})

test('deleteTimestampNote: row delete fails -> error, no file removed', async () => {
  seedVoiceNotes()
  fail({ table: 'timestamp_notes', action: 'delete', error: { message: 'boom' } })
  assert.ok('error' in await deleteTimestampNote('n1'))
  assert.deepEqual(state.storageOps, [])
})

test('deleteTimestampNote: a crafted body copying another note\'s recording removes no file', async () => {
  seedVoiceNotes()
  // The player adds a note whose body points at the coach's recording, then deletes it.
  state.tables.timestamp_notes.push({ id: 'n4', clip_id: C, created_by: 'player-user', body: `__voice__:${TS_VOICE}` })
  state.user = { id: 'player-user' }
  const orig = console.error
  console.error = () => {}
  try { assert.deepEqual(await deleteTimestampNote('n4'), { success: true }) } finally { console.error = orig }
  assert.deepEqual(state.storageOps, [])
  assert.ok(state.storage.clips.includes(TS_VOICE))
  assert.ok(state.tables.timestamp_notes.some(n => n.id === 'n1'), 'the coach\'s note is untouched')
})

test('deleteTimestampNote: a crafted body naming the clip voice note or another clip\'s recording removes no file', async () => {
  seedVoiceNotes()
  const C2 = '33333333-3333-4333-8333-333333333334'
  const OTHER_CLIP_TS = `${P}/${C2}/ts_voice/def456.webm`
  state.storage.clips.push(OTHER_CLIP_TS)
  state.tables.timestamp_notes.push(
    { id: 'n5', clip_id: C, created_by: COACH.id, body: `__voice__:${VOICE}` },
    { id: 'n6', clip_id: C, created_by: COACH.id, body: `__voice__:${OTHER_CLIP_TS}` },
    { id: 'n7', clip_id: C, created_by: COACH.id, body: `__voice__:${P}/${C}/ts_voice/../voice.webm` },
  )
  for (const id of ['n5', 'n6', 'n7']) assert.deepEqual(await deleteTimestampNote(id), { success: true })
  assert.deepEqual(state.storageOps, [])
  assert.ok(state.storage.clips.includes(VOICE) && state.storage.clips.includes(OTHER_CLIP_TS))
})

test('deleteTimestampNote: the recording-ownership check fails -> note deleted, file kept, warning (not plain success)', async () => {
  seedVoiceNotes()
  // Fail only the select that runs after the note row is deleted.
  const afterDelete = () => state.ops.some(o => o.table === 'timestamp_notes' && o.action === 'delete')
  fail({ table: 'timestamp_notes', action: 'select', error: { message: 'timeout' }, when: afterDelete })
  const orig = console.error
  console.error = () => {}
  let r
  try { r = await deleteTimestampNote('n1') as { success?: true; warning?: string } } finally { console.error = orig }
  assert.equal(r.success, true)
  assert.match(String(r.warning), /recording couldn't be removed/)
  assert.ok(!state.tables.timestamp_notes.some(n => n.id === 'n1'))
  assert.deepEqual(state.storageOps, [])
})

test('clearAnnotations: returns the ids it deleted (own marks only)', async () => {
  seed()
  const r = await clearAnnotations(C)
  assert.ok('removedIds' in r)
  assert.deepEqual([...(r.removedIds ?? [])].sort(), ['a-mine-1', 'a-mine-2'])
  assert.deepEqual(state.tables.annotations.map(a => a.id), ['a-player'])
})

test('clearAnnotations: delete fails -> error, nothing deleted', async () => {
  seed()
  fail({ table: 'annotations', action: 'delete', error: { message: 'boom' } })
  assert.deepEqual(await clearAnnotations(C), { error: 'boom' })
  assert.equal(state.tables.annotations.length, 3)
})

test('deleteAnnotation and renameClip return the database error', async () => {
  seed()
  fail({ table: 'annotations', action: 'delete', error: { message: 'boom' } })
  assert.deepEqual(await deleteAnnotation('a-mine-1'), { error: 'boom' })
  fail({ table: 'clips', action: 'update', error: { message: 'rename failed' } })
  assert.deepEqual(await renameClip(C, 'New title'), { error: 'rename failed' })
})

// Lessons phase 1 (#13): a new recording adds a lessons row and never deletes
// older recordings, so there is no "previous file" cleanup to warn about.
test('saveLessonPath: adds a lesson, keeps the previous recording, plain success', async () => {
  seed()
  state.tables.lessons = []
  assert.deepEqual(await saveLessonPath(C, NEW_LESSON), { success: true })
  assert.equal(state.tables.lessons.length, 1)
  assert.equal(state.tables.clips[0].lesson_path, NEW_LESSON)
  assert.deepEqual(state.storage.lessons, [OLD_LESSON])
})

test('saveLessonPath: lessons insert fails -> error, not success', async () => {
  seed()
  state.tables.lessons = []
  fail({ table: 'lessons', action: 'insert', error: { message: 'boom' } })
  const r = await saveLessonPath(C, NEW_LESSON)
  assert.ok('error' in r, JSON.stringify(r))
  assert.equal(state.tables.lessons.length, 0)
})

test('saveLessonPath: player without 18+ confirmation or guardian consent -> error, nothing changed', async () => {
  seed()
  state.tables.players[0].adult_confirmed_at = null
  const r = await saveLessonPath(C, NEW_LESSON)
  assert.ok('error' in r && r.error, JSON.stringify(r))
  assert.equal(state.tables.clips[0].lesson_path, OLD_LESSON)
  assert.deepEqual(state.storage.lessons, [OLD_LESSON])
})
