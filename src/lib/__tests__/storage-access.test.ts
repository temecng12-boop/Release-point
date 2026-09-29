/**
 * Signed-URL ownership checks. No Supabase: uses an in-memory fake of the query builder.
 * Run with: npx tsx --test src/lib/__tests__/storage-access.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideStorageAccess, parseStoragePath } from '../storage-access'
import type { AccessDb } from '../clip-access'

type Row = Record<string, string | null>
type Tables = Record<string, Row[] | 'missing'>

function fakeDb(tables: Tables): AccessDb {
  const missing = (t: string) => ({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` } })
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              const rows = () => {
                const t = tables[table]
                return t === 'missing' ? null : (t ?? []).filter(r => r[col] === val)
              }
              const all = () => { const r = rows(); return r === null ? missing(table) : { data: r, error: null } }
              return {
                then: (res: (v: ReturnType<typeof all>) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(all()).then(res, rej),
                maybeSingle: () => { const r = rows(); return Promise.resolve(r === null ? missing(table) : { data: r[0] ?? null, error: null }) },
                in: (col2: string, vals: string[]) => { const r = rows(); return Promise.resolve(r === null ? missing(table) : { data: r.filter(x => vals.includes(x[col2] as string)), error: null }) },
              }
            },
          }
        },
      }
    },
  } as unknown as AccessDb
}

const P1 = '11111111-1111-4111-8111-111111111111'  // coach OWNER, player PLAYER, guardian GUARD, team T via player_teams
const P2 = '22222222-2222-4222-8222-222222222222'  // no coach, no team
const CLIP = '33333333-3333-4333-8333-333333333333'
const OWNER = 'u-owner', ASST = 'u-asst', OFF = 'u-off', PLAYER = 'u-player', GUARD = 'u-guardian', GUARD_COACH = 'u-guardian-coach'
const base = (): Tables => ({
  players: [
    { id: P1, coach_id: OWNER, user_id: PLAYER, guardian_id: 'g1', team_id: null },
    { id: P2, coach_id: null, user_id: null, guardian_id: 'g2', team_id: null },
  ],
  guardians: [{ id: 'g1', user_id: GUARD }, { id: 'g2', user_id: GUARD_COACH }],
  player_teams: [{ player_id: P1, team_id: 'T' }, { player_id: P2, team_id: 'T' }],
  team_coaches: [
    { team_id: 'T', coach_id: OWNER, role: 'organizer' },
    { team_id: 'T', coach_id: ASST, role: 'assistant' },
    { team_id: 'T', coach_id: GUARD_COACH, role: 'assistant' },
  ],
})

// Every path format the app generates today
const clipUpload = `${P1}/1727640000000.mp4`
const bulkUpload = `${P1}/1727640000000-k3j9x2.mov`
const voice = `${P1}/${CLIP}/voice.webm`
const tsVoice = `${P1}/${CLIP}/ts_voice/lx1abc.m4a`
const lesson = `${P1}/${CLIP}/lesson.webm`

const allowed = async (db: AccessDb, user: string | null, bucket: string, path: string, mode: 'read' | 'write') =>
  (await decideStorageAccess(db, user, bucket, path, mode)).allowed

test('parseStoragePath accepts every generated path format', () => {
  for (const p of [clipUpload, bulkUpload, voice, tsVoice, lesson]) assert.deepEqual(parseStoragePath(p), { ok: true, playerId: P1 }, p)
})

test('parseStoragePath rejects traversal, unknown prefixes and malformed paths', () => {
  const bad = [
    `${P1}/../${P2}/x.mp4`, `../${P1}/x.mp4`, `${P1}/./x.mp4`, `${P1}/..`, `/${P1}/x.mp4`, `${P1}//x.mp4`, `${P1}/x.mp4/`,
    `${P1}\\..\\x.mp4`, `${P1}/%2e%2e/x.mp4`, `${P1}/a..b.mp4`, `${P1}`, 'avatars/x.png', 'public/x.mp4', `not-a-uuid/x.mp4`,
    '', `${P1}/x y.mp4`, `${P1}/.hidden`, `${P1}/x.mp4\u0000`, 'x'.repeat(600),
  ]
  for (const p of bad) assert.equal(parseStoragePath(p).ok, false, JSON.stringify(p))
  assert.equal(parseStoragePath(null).ok, false)
  assert.equal(parseStoragePath(42).ok, false)
})

test('player reads and uploads in their own folder (clips), not lessons writes', async () => {
  const db = fakeDb(base())
  for (const p of [clipUpload, bulkUpload, voice, tsVoice]) {
    assert.equal(await allowed(db, PLAYER, 'clips', p, 'read'), true, p)
    assert.equal(await allowed(db, PLAYER, 'clips', p, 'write'), true, p)
  }
  assert.equal(await allowed(db, PLAYER, 'lessons', lesson, 'read'), true)
  assert.equal(await allowed(db, PLAYER, 'lessons', lesson, 'write'), false)
  assert.equal(await allowed(db, PLAYER, 'clips', `${P2}/1.mp4`, 'write'), false)
  assert.equal(await allowed(db, PLAYER, 'clips', `${P2}/1.mp4`, 'read'), false)
})

test('direct coach reads and writes clips and lessons', async () => {
  const db = fakeDb(base())
  for (const [b, p] of [['clips', clipUpload], ['clips', voice], ['clips', tsVoice], ['lessons', lesson]]) {
    assert.equal(await allowed(db, OWNER, b, p, 'read'), true, p)
    assert.equal(await allowed(db, OWNER, b, p, 'write'), true, p)
  }
})

test('team (assistant) coach reads and writes through team_coaches + player_teams', async () => {
  const db = fakeDb(base())
  const r = await decideStorageAccess(db, ASST, 'clips', clipUpload, 'write')
  assert.deepEqual(r, { allowed: true, playerId: P1, via: 'team_coach', teamCheck: 'ok' })
  assert.equal(await allowed(db, ASST, 'lessons', lesson, 'write'), true)
  assert.equal(await allowed(db, ASST, 'clips', tsVoice, 'read'), true)
})

test('guardian is read-only', async () => {
  const db = fakeDb(base())
  assert.equal(await allowed(db, GUARD, 'clips', tsVoice, 'read'), true)
  assert.equal(await allowed(db, GUARD, 'lessons', lesson, 'read'), true)
  const w = await decideStorageAccess(db, GUARD, 'clips', clipUpload, 'write')
  assert.equal(w.allowed, false)
  assert.equal(await allowed(db, GUARD, 'lessons', lesson, 'write'), false)
})

test('guardian who is also a team coach of the player can write', async () => {
  const db = fakeDb(base())
  assert.equal(await allowed(db, GUARD_COACH, 'clips', `${P2}/1.mp4`, 'write'), true)
})

test('stranger, off-team coach and signed-out caller are denied', async () => {
  const db = fakeDb(base())
  for (const user of [OFF, 'u-random', null, '']) {
    for (const mode of ['read', 'write'] as const) {
      assert.equal(await allowed(db, user, 'clips', clipUpload, mode), false, `${user} ${mode}`)
      assert.equal(await allowed(db, user, 'lessons', lesson, mode), false, `${user} ${mode}`)
    }
  }
})

test('a null user never matches a player with a null user_id / coach_id', async () => {
  const db = fakeDb(base())
  assert.equal(await allowed(db, null, 'clips', `${P2}/1.mp4`, 'read'), false)
  assert.equal(await allowed(db, undefined as unknown as null, 'clips', `${P2}/1.mp4`, 'write'), false)
})

test('traversal, unknown bucket and unknown player are denied even for the owner coach', async () => {
  const db = fakeDb(base())
  assert.equal(await allowed(db, OWNER, 'clips', `${P1}/../${P2}/1.mp4`, 'read'), false)
  assert.equal(await allowed(db, OWNER, 'clips', `../${P1}/1.mp4`, 'write'), false)
  assert.equal(await allowed(db, OWNER, 'avatars', clipUpload, 'read'), false)
  assert.equal(await allowed(db, OWNER, 'clips', '99999999-9999-4999-8999-999999999999/1.mp4', 'read'), false)
  assert.equal(await allowed(db, OWNER, 'clips', 'avatars/me.png', 'read'), false)
})

test('team_coaches missing (018 not applied): team path skipped, direct access unchanged', async () => {
  const db = fakeDb({ ...base(), team_coaches: 'missing' })
  const asst = await decideStorageAccess(db, ASST, 'clips', clipUpload, 'read')
  assert.deepEqual(asst, { allowed: false, reason: 'no access to player', teamCheck: 'unavailable' })
  assert.equal(await allowed(db, ASST, 'clips', clipUpload, 'write'), false)
  assert.equal(await allowed(db, OWNER, 'lessons', lesson, 'write'), true)
  assert.equal(await allowed(db, PLAYER, 'clips', clipUpload, 'write'), true)
  assert.equal(await allowed(db, GUARD, 'clips', tsVoice, 'read'), true)
  assert.equal(await allowed(db, GUARD, 'clips', clipUpload, 'write'), false)
  assert.equal(await allowed(db, GUARD_COACH, 'clips', `${P2}/1.mp4`, 'read'), true)   // still a guardian
  assert.equal(await allowed(db, GUARD_COACH, 'clips', `${P2}/1.mp4`, 'write'), false) // team path unavailable
})

test('player_teams missing: team path skipped, direct access unchanged', async () => {
  const db = fakeDb({ ...base(), player_teams: 'missing' })
  assert.equal(await allowed(db, ASST, 'clips', clipUpload, 'read'), false)
  assert.equal(await allowed(db, OWNER, 'clips', clipUpload, 'write'), true)
  assert.equal(await allowed(db, PLAYER, 'clips', tsVoice, 'read'), true)
})
