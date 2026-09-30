/**
 * Account deletion: cleanup plan, execution order and error paths. In-memory fakes, no Supabase.
 * Run with: npx tsx --test src/lib/__tests__/account-deletion.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deleteAccountFlow, executeDeletionPlan, gatherDeletionFacts, planAccountDeletion, isSafeStoragePath,
  type DeletionDb, type DeletionStorage, type Row, type DbError,
} from '../account-deletion'

type Tables = Record<string, Row[] | 'missing'>
const MISSING_TABLE = (t: string): DbError => ({ code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` })

function fakeDb(tables: Tables, opts: { missingColumns?: string[]; failOn?: { op: string; table: string } } = {}) {
  const ops: string[] = []
  const match = (r: Row, f: Record<string, string[]>) => Object.entries(f).every(([c, vs]) => vs.includes(r[c] as string))
  const table = (t: string) => tables[t]
  const colMissing = (t: string, cols: string[]) => cols.some(c => opts.missingColumns?.includes(`${t}.${c}`))
  const db: DeletionDb = {
    async select(t, columns, filters) {
      const rows = table(t)
      if (rows === 'missing') return { error: MISSING_TABLE(t) }
      const cols = columns.split(',').map(s => s.trim())
      if (colMissing(t, cols)) return { error: { code: '42703', message: `column ${t}.${cols[1]} does not exist` } }
      return { rows: (rows ?? []).filter(r => match(r, filters)).map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? null]))) }
    },
    async update(t, set, filters) {
      ops.push(`update ${t} ${JSON.stringify(set)} ${JSON.stringify(filters)}`)
      if (opts.failOn?.op === 'update' && opts.failOn.table === t) return { error: { code: '23503', message: 'boom' } }
      const rows = table(t)
      if (rows === 'missing') return { error: MISSING_TABLE(t) }
      if (colMissing(t, [...Object.keys(set), ...Object.keys(filters)])) return { error: { code: 'PGRST204', message: `Could not find the '${Object.keys(set)[0]}' column` } }
      for (const r of rows ?? []) if (match(r, filters)) Object.assign(r, set)
      return {}
    },
    async delete(t, filters) {
      ops.push(`delete ${t} ${JSON.stringify(filters)}`)
      if (opts.failOn?.op === 'delete' && opts.failOn.table === t) return { error: { code: '23503', message: 'boom' } }
      const rows = table(t)
      if (rows === 'missing') return { error: MISSING_TABLE(t) }
      tables[t] = (rows ?? []).filter(r => !match(r, filters))
      return {}
    },
  }
  return { db, ops }
}

function fakeStorage(objects: Record<string, string[]>, opts: { failList?: boolean; failRemove?: boolean } = {}) {
  const removed: string[] = []
  const listed: string[] = []
  const storage: DeletionStorage = {
    async list(bucket, folder, search) {
      listed.push(`${bucket}:${folder}`)
      if (opts.failList) return { error: { message: 'storage down' } }
      const files = new Set<string>(), folders = new Set<string>()
      for (const p of objects[bucket] ?? []) {
        if (!p.startsWith(`${folder}/`)) continue
        const rest = p.slice(folder.length + 1).split('/')
        if (rest.length === 1) { if (!search || rest[0].includes(search)) files.add(rest[0]) } else folders.add(rest[0])
      }
      return { files: [...files], folders: [...folders] }
    },
    async remove(bucket, paths) {
      if (opts.failRemove) return { error: { message: 'remove failed' } }
      for (const p of paths) { removed.push(`${bucket}:${p}`); objects[bucket] = (objects[bucket] ?? []).filter(x => x !== p) }
      return {}
    },
  }
  return { storage, removed, listed }
}

// ids
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const COACH = u(1), PLAYER_USER = u(2), GUARD_USER = u(3), OTHER_COACH = u(4), ASST = u(5), STRANGER = u(6)
const P_OWN = u(101)        // PLAYER_USER's own row, coached by COACH
const P_UNCLAIMED = u(102)  // coached by COACH, no login, no guardian, no team -> deleted with COACH
const P_GUARDED = u(103)    // coached by COACH, no login, guardian GUARD_USER
const P_TEAM = u(104)       // coached by COACH, no login, on team T2 organized by OTHER_COACH
const P_OTHER = u(105)      // someone else's player (OTHER_COACH), untouched
const P_T1 = u(106)         // coached by OTHER_COACH, on team T1 organized by COACH
const C1 = u(201), C2 = u(202), C3 = u(203), C4 = u(204), C5 = u(205), C6 = u(206)
const T1 = u(301), T2 = u(302), T3 = u(303)

function world(): Tables {
  return {
    profiles: [{ id: COACH }, { id: PLAYER_USER }, { id: GUARD_USER }, { id: OTHER_COACH }],
    guardians: [{ id: u(401), user_id: GUARD_USER }],
    teams: [{ id: T1, coach_id: COACH }, { id: T2, coach_id: OTHER_COACH }, { id: T3, coach_id: COACH }],
    team_coaches: [
      { team_id: T1, coach_id: COACH, role: 'organizer', joined_at: '2026-01-01' },
      { team_id: T1, coach_id: ASST, role: 'assistant', joined_at: '2026-02-01' },
      { team_id: T3, coach_id: COACH, role: 'organizer', joined_at: '2026-01-01' },
      { team_id: T2, coach_id: OTHER_COACH, role: 'organizer', joined_at: '2026-01-01' },
    ],
    players: [
      { id: P_OWN, user_id: PLAYER_USER, coach_id: COACH, guardian_id: null, team_id: null },
      { id: P_UNCLAIMED, user_id: null, coach_id: COACH, guardian_id: null, team_id: T3 },
      { id: P_GUARDED, user_id: null, coach_id: COACH, guardian_id: u(401), team_id: null },
      { id: P_TEAM, user_id: null, coach_id: COACH, guardian_id: null, team_id: null },
      { id: P_OTHER, user_id: null, coach_id: OTHER_COACH, guardian_id: null, team_id: null },
      { id: P_T1, user_id: null, coach_id: OTHER_COACH, guardian_id: null, team_id: T1 },
    ],
    player_teams: [{ player_id: P_TEAM, team_id: T2 }],
    clips: [
      { id: C1, player_id: P_OWN, uploaded_by: COACH, storage_path: `${P_OWN}/1.mp4`, voice_path: `${P_OWN}/${C1}/voice.webm`, lesson_path: null },
      { id: C2, player_id: P_UNCLAIMED, uploaded_by: COACH, storage_path: `${P_UNCLAIMED}/2.mp4`, voice_path: null, lesson_path: null },
      { id: C3, player_id: P_GUARDED, uploaded_by: COACH, storage_path: `${P_GUARDED}/3.mp4`, voice_path: null, lesson_path: `${P_GUARDED}/${C3}/lesson.webm` },
      { id: C4, player_id: P_TEAM, uploaded_by: COACH, storage_path: `${P_TEAM}/4.mp4`, voice_path: null, lesson_path: null },
      { id: C5, player_id: P_OTHER, uploaded_by: OTHER_COACH, storage_path: `${P_OTHER}/5.mp4`, voice_path: null, lesson_path: null },
      { id: C6, player_id: P_OWN, uploaded_by: PLAYER_USER, storage_path: `${P_OWN}/6.mp4`, voice_path: null, lesson_path: null },
    ],
    annotations: [
      { id: u(501), clip_id: C1, created_by: COACH },
      { id: u(502), clip_id: C5, created_by: COACH },      // COACH's note on someone else's clip
      { id: u(503), clip_id: C5, created_by: OTHER_COACH },
    ],
    timestamp_notes: [
      { id: u(601), clip_id: C5, created_by: COACH, body: `__voice__:${P_OTHER}/${C5}/ts_voice/abc.webm` },
      { id: u(602), clip_id: C5, created_by: COACH, body: `__voice__:${P_OWN}/../x.webm` },   // traversal: never removed
      { id: u(603), clip_id: C5, created_by: OTHER_COACH, body: 'keep' },
    ],
    pitch_metrics: [
      { id: u(701), clip_id: C1, created_by: COACH },
      { id: u(702), clip_id: C5, created_by: COACH },
      { id: u(703), clip_id: C5, created_by: OTHER_COACH },
    ],
    waitlist: [{ id: u(801), email: 'coach@example.com' }, { id: u(802), email: 'other@example.com' }],
  }
}
function objects(): Record<string, string[]> {
  return {
    clips: [
      `${P_OWN}/1.mp4`, `${P_OWN}/6.mp4`, `${P_OWN}/${C1}/voice.webm`, `${P_OWN}/${C1}/ts_voice/z.webm`,
      `${P_UNCLAIMED}/2.mp4`, `${P_GUARDED}/3.mp4`, `${P_TEAM}/4.mp4`,
      `${P_OTHER}/5.mp4`, `${P_OTHER}/${C5}/ts_voice/abc.webm`, `${P_OTHER}/${C5}/ts_voice/other.webm`,
    ],
    lessons: [`${P_GUARDED}/${C3}/lesson.webm`, `${P_UNCLAIMED}/${C2}/lesson.webm`, `${P_OTHER}/${C5}/lesson.webm`],
    profiles: [`avatars/${COACH}.jpg`, `avatars/${OTHER_COACH}.jpg`],
  }
}
const ids = (rows: Row[] | 'missing' | undefined) => rows === 'missing' ? [] : (rows ?? []).map(r => r.id as string).sort()
const find = (t: Tables, table: string, id: string) => (t[table] as Row[]).find(r => r.id === id)

async function runFor(userId: string, email: string | null, t = world(), o = objects(), dbOpts = {}) {
  const { db, ops } = fakeDb(t, dbOpts)
  const s = fakeStorage(o)
  const plan = planAccountDeletion(await gatherDeletionFacts(db, userId, email))
  const res = await executeDeletionPlan(db, s.storage, plan)
  return { t, o, plan, res, ops, ...s }
}

test('coach: players detached or deleted per heir rule, teams transferred or deleted', async () => {
  const { t, plan } = await runFor(COACH, 'coach@example.com')
  assert.deepEqual(plan.deletePlayerIds, [P_UNCLAIMED])
  assert.deepEqual(plan.detachCoachPlayerIds.sort(), [P_OWN, P_GUARDED, P_TEAM].sort())
  assert.deepEqual(plan.transferTeams, [{ teamId: T1, toCoachId: ASST }])
  assert.deepEqual(plan.deleteTeamIds, [T3])
  assert.equal(find(t, 'teams', T1)?.coach_id, ASST)
  assert.equal((t.team_coaches as Row[]).find(r => r.team_id === T1 && r.coach_id === ASST)?.role, 'organizer')
  assert.deepEqual(ids(t.teams), [T1, T2])
  assert.deepEqual(ids(t.players), [P_OWN, P_GUARDED, P_TEAM, P_OTHER, P_T1].sort())
  for (const p of [P_OWN, P_GUARDED, P_TEAM]) assert.equal(find(t, 'players', p)?.coach_id, null)
  assert.equal(find(t, 'players', P_T1)?.coach_id, OTHER_COACH)   // other coach's player untouched
  assert.equal(find(t, 'players', P_T1)?.team_id, T1)              // team survives (transferred)
})

test('coach: clips reassigned to the heir (player, guardian, team organizer), never left pointing at the user', async () => {
  const { t } = await runFor(COACH, 'coach@example.com')
  assert.equal(find(t, 'clips', C1)?.uploaded_by, PLAYER_USER)
  assert.equal(find(t, 'clips', C3)?.uploaded_by, GUARD_USER)
  assert.equal(find(t, 'clips', C4)?.uploaded_by, OTHER_COACH)
  // C2 goes with P_UNCLAIMED via ON DELETE CASCADE (checked on PGlite; this fake has no cascades)
  for (const table of ['clips', 'annotations', 'timestamp_notes', 'pitch_metrics'])
    for (const r of t[table] as Row[]) if (table !== 'clips' || r.player_id !== P_UNCLAIMED)
      assert.notEqual(r.uploaded_by ?? r.created_by, COACH, `${table} ${r.id}`)
})

test('coach: own annotations/notes deleted, metrics reassigned, other users\' rows kept', async () => {
  const { t } = await runFor(COACH, 'coach@example.com')
  assert.deepEqual(ids(t.annotations), [u(503)])
  assert.deepEqual(ids(t.timestamp_notes), [u(603)])
  assert.equal(find(t, 'pitch_metrics', u(701))?.created_by, PLAYER_USER)
  assert.equal(find(t, 'pitch_metrics', u(702))?.created_by, OTHER_COACH)
  assert.equal(find(t, 'pitch_metrics', u(703))?.created_by, OTHER_COACH)
  assert.deepEqual(ids(t.waitlist), [u(802)])
})

test('coach: storage removes only listed files of deleted data, plus own avatar', async () => {
  const { removed, o } = await runFor(COACH, 'coach@example.com')
  assert.deepEqual(removed.sort(), [
    `clips:${P_OTHER}/${C5}/ts_voice/abc.webm`,     // voice file of COACH's deleted timestamp note
    `clips:${P_UNCLAIMED}/2.mp4`,
    `lessons:${P_UNCLAIMED}/${C2}/lesson.webm`,
    `profiles:avatars/${COACH}.jpg`,
  ].sort())
  assert.ok(o.clips.includes(`${P_OTHER}/${C5}/ts_voice/other.webm`))
  assert.ok(o.clips.includes(`${P_OWN}/1.mp4`))
  assert.ok(o.profiles.includes(`avatars/${OTHER_COACH}.jpg`))
})

test('player: own row deleted with its whole storage folders; coach and others untouched', async () => {
  const { t, plan, removed } = await runFor(PLAYER_USER, null)
  assert.deepEqual(plan.deletePlayerIds, [P_OWN])
  assert.deepEqual(plan.detachCoachPlayerIds, [])
  assert.ok(!ids(t.players).includes(P_OWN))
  assert.equal(ids(t.players).length, 5)
  assert.deepEqual(removed.sort(), [`clips:${P_OWN}/1.mp4`, `clips:${P_OWN}/6.mp4`, `clips:${P_OWN}/${C1}/ts_voice/z.webm`, `clips:${P_OWN}/${C1}/voice.webm`].sort())
  assert.deepEqual(ids(t.teams), [T1, T2, T3])
})

test('guardian: guardian row deleted, child detached (kept, still has a coach)', async () => {
  const { t, plan } = await runFor(GUARD_USER, null)
  assert.deepEqual(plan.deletePlayerIds, [])
  assert.deepEqual(ids(t.guardians), [])
  assert.equal(find(t, 'players', P_GUARDED)?.guardian_id, null)
  assert.equal(find(t, 'players', P_GUARDED)?.coach_id, COACH)
})

test('018 not applied: team_coaches missing -> organized teams deleted (players kept), no error', async () => {
  const w = world(); w.team_coaches = 'missing'
  const { t, plan, res } = await runFor(COACH, 'coach@example.com', w)
  assert.deepEqual(plan.transferTeams, [])
  assert.deepEqual(plan.deleteTeamIds.sort(), [T1, T3].sort())
  assert.deepEqual(ids(t.teams), [T2])
  assert.equal(find(t, 'players', P_T1)?.team_id, null)
  assert.ok(find(t, 'players', P_T1))
  assert.ok(res.log.some(l => l.includes('team_coaches')))
})

test('missing optional tables/columns are skipped: player_teams, waitlist, lesson_path, guardians.created_by', async () => {
  const w = world(); w.player_teams = 'missing'; w.waitlist = 'missing'
  const { plan, res } = await runFor(COACH, 'coach@example.com', w, objects(), { missingColumns: ['clips.lesson_path', 'guardians.created_by'] })
  // Without player_teams, P_TEAM has no heir -> deleted with the coach
  assert.ok(plan.deletePlayerIds.includes(P_TEAM))
  assert.ok(res.log.some(l => l.includes('waitlist')))
  assert.ok(res.log.some(l => l.includes('created_by')))
})

test('storage list failure aborts before any database write', async () => {
  const { db, ops } = fakeDb(world())
  const s = fakeStorage(objects(), { failList: true })
  const plan = planAccountDeletion(await gatherDeletionFacts(db, COACH, null))
  await assert.rejects(executeDeletionPlan(db, s.storage, plan), /list clips/)
  assert.deepEqual(ops, [])
})

test('flow: no session is refused and nothing is touched', async () => {
  const { db, ops } = fakeDb(world())
  let called = false
  const r = await deleteAccountFlow({ userId: null, email: null, db, storage: fakeStorage(objects()).storage, deleteAuthUser: async () => { called = true; return {} } })
  assert.equal(r.ok, false)
  assert.equal(called, false)
  assert.deepEqual(ops, [])
})

test('flow: a DB error stops the flow and the auth user is NOT deleted', async () => {
  const { db } = fakeDb(world(), { failOn: { op: 'delete', table: 'players' } })
  let called = false
  const r = await deleteAccountFlow({ userId: COACH, email: null, db, storage: fakeStorage(objects()).storage, deleteAuthUser: async () => { called = true; return {} } })
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.step, 'delete players'); assert.match(r.error, /couldn't delete your account/) }
  assert.equal(called, false)
})

test('flow: storage remove error stops the flow before deleting the login', async () => {
  const { db } = fakeDb(world())
  let called = false
  const r = await deleteAccountFlow({ userId: PLAYER_USER, email: null, db, storage: fakeStorage(objects(), { failRemove: true }).storage, deleteAuthUser: async () => { called = true; return {} } })
  assert.equal(r.ok, false)
  assert.equal(called, false)
})

test('flow: auth deleteUser error (returned or thrown) is reported, not success', async () => {
  for (const deleteAuthUser of [async () => ({ error: { message: 'Database error deleting user' } }), async () => { throw new Error('network') }]) {
    const { db } = fakeDb(world())
    const r = await deleteAccountFlow({ userId: STRANGER, email: null, db, storage: fakeStorage(objects()).storage, deleteAuthUser })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.step, 'delete login')
  }
})

test('flow: success deletes the login with the signed-in id only', async () => {
  const { db } = fakeDb(world())
  const seen: string[] = []
  const r = await deleteAccountFlow({ userId: STRANGER, email: null, db, storage: fakeStorage(objects()).storage, deleteAuthUser: async (id) => { seen.push(id); return { error: null } } })
  assert.equal(r.ok, true)
  assert.deepEqual(seen, [STRANGER])
})

test('isSafeStoragePath rejects traversal and non-player prefixes', () => {
  assert.equal(isSafeStoragePath(`${P_OWN}/1.mp4`), true)
  for (const p of [`${P_OWN}/../x`, `../${P_OWN}/x`, `avatars/${COACH}.jpg`, `${P_OWN}//x`, `/${P_OWN}/x`, '', `${P_OWN}/a b`]) assert.equal(isSafeStoragePath(p), false, p)
})
