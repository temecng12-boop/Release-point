/**
 * deletePlayer (Compliance D2): the player's storage files go with the row.
 * Paths are collected first, the row is deleted, then the files are removed;
 * a storage failure after the row is gone is a warning, never a clean success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/player-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { deletePlayer } from '../../../app/actions/player'

const COACH = { id: 'coach', email: 'coach@example.com' }
const P = '11111111-1111-4111-8111-111111111111'
const P_USER = '22222222-2222-4222-8222-222222222222'
// Another player and account whose ids start like P / P_USER's file names: never touched.
const OTHER = '11111111-1111-4111-8111-111111111112'
const C = '33333333-3333-4333-8333-333333333333'

const MINE = {
  clips: [`${P}/1.mp4`, `${P}/${C}/voice.webm`, `${P}/${C}/ts_voice/abc.webm`],
  lessons: [`${P}/${C}/lesson-1-a.webm`],
}
const THEIRS = {
  // The linked account's avatar is never the coach's to delete (account deletion handles it).
  clips: [`${OTHER}/2.mp4`, `avatars/${P_USER}.jpg`, `avatars/${P_USER}0.jpg`, `avatars/${COACH.id}.jpg`],
  profiles: [`avatars/${P_USER}.png`],
  lessons: [`${OTHER}/${C}/lesson-1-a.webm`],
}

function seed(userId: string | null = P_USER) {
  resetFake({
    user: COACH,
    tables: {
      players: [
        { id: P, coach_id: COACH.id, user_id: userId, full_name: 'A' },
        { id: OTHER, coach_id: COACH.id, user_id: null, full_name: 'B' },
      ],
      profiles: [{ id: P_USER, avatar_url: 'https://storage.test/x' }],
    },
    storage: { clips: [...MINE.clips, ...THEIRS.clips], lessons: [...MINE.lessons, ...THEIRS.lessons], profiles: [...THEIRS.profiles] },
  })
}
const removed = () => state.storageOps.flatMap(o => o.paths.map(p => `${o.bucket}:${p}`)).sort()

test('deletePlayer: removes the row, clip videos, voice notes and lessons; nothing else', async () => {
  seed()
  assert.deepEqual(await deletePlayer(P), { success: true })
  assert.deepEqual(state.tables.players.map(r => r.id), [OTHER])
  assert.deepEqual(removed(), [...MINE.clips.map(p => `clips:${p}`), ...MINE.lessons.map(p => `lessons:${p}`)].sort())
  assert.deepEqual(state.storage, THEIRS)
})

test('deletePlayer: leaves the linked account\'s avatar alone (file and profiles.avatar_url)', async () => {
  // A players row can name any user_id (e.g. forged through the API before
  // migration 032), so deletePlayer must never reach into that account.
  seed()
  assert.deepEqual(await deletePlayer(P), { success: true })
  assert.ok(state.storage.clips.includes(`avatars/${P_USER}.jpg`))
  assert.ok(state.storage.profiles.includes(`avatars/${P_USER}.png`))
  assert.equal(state.tables.profiles[0].avatar_url, 'https://storage.test/x')
  assert.ok(!state.ops.some(o => o.table === 'profiles'), 'no profiles read or write')
  assert.ok(!removed().some(p => p.includes('avatars/')), 'no avatar removal requested')
})

test('deletePlayer: player without an account -> folders still removed', async () => {
  seed(null)
  assert.deepEqual(await deletePlayer(P), { success: true })
  assert.ok(state.storage.clips.includes(`avatars/${P_USER}.jpg`))
  assert.ok(!state.storage.clips.includes(`${P}/1.mp4`))
})

test('deletePlayer: storage removal fails after the row is gone -> warning, leftovers logged', async () => {
  seed()
  fail({ bucket: 'lessons', error: { message: 'storage unavailable' } })
  const logged: unknown[][] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { logged.push(a) }
  try {
    const r = await deletePlayer(P) as { success?: true; warning?: string }
    assert.equal(r.success, true)
    assert.match(String(r.warning), /Player removed, but some of their files couldn't be deleted/)
  } finally { console.error = orig }
  assert.deepEqual(state.tables.players.map(r => r.id), [OTHER])
  assert.ok(state.storage.lessons.includes(`${P}/${C}/lesson-1-a.webm`))
  assert.ok(!state.storage.clips.includes(`${P}/1.mp4`))
  const entry = logged.find(a => String(a[0]).includes('storage files left'))
  assert.deepEqual((entry?.[1] as { leftoverFiles: string[] }).leftoverFiles, [`lessons:${P}/${C}/lesson-1-a.webm`])
})

test('deletePlayer: row delete fails -> neutral error (no DB text), logged, no files removed', async () => {
  seed()
  fail({ table: 'players', action: 'delete', error: { message: 'boom: relation "players" secret detail' } })
  const logged: unknown[][] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { logged.push(a) }
  let r
  try { r = await deletePlayer(P) } finally { console.error = orig }
  assert.deepEqual(r, { error: 'Could not remove this player. Please try again.' })
  assert.ok(logged.some(a => JSON.stringify(a).includes('secret detail')), 'the DB error is logged server-side')
  assert.deepEqual(state.storageOps, [])
  assert.equal(state.tables.players.length, 2)
})

test('deletePlayer: storage listing fails -> error before anything is deleted', async () => {
  seed()
  fail({ bucket: 'clips', storageOp: 'list', error: { message: 'storage down' } })
  assert.ok('error' in await deletePlayer(P))
  assert.equal(state.tables.players.length, 2)
  assert.deepEqual(state.storageOps, [])
})

test('deletePlayer: another coach\'s player -> not found, nothing touched', async () => {
  seed()
  state.tables.players[0].coach_id = 'someone-else'
  assert.deepEqual(await deletePlayer(P), { error: 'Player not found' })
  assert.equal(state.tables.players.length, 2)
  assert.deepEqual(state.storageOps, [])
})
