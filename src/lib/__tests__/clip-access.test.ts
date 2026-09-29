/**
 * Clip access decision. No Supabase: uses an in-memory fake of the query builder.
 * Run with: npx tsx --test src/lib/__tests__/clip-access.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canViewPlayerContent, directAccess, type AccessDb } from '../clip-access'

type Row = Record<string, string | null>
type Tables = Record<string, Row[] | 'missing'>

// Fake supporting .from(t).select(c).eq(k, v)[.maybeSingle() | .in(k, vs)]
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

const OWNER = 'u-owner', ASST = 'u-asst', OFF = 'u-off', PLAYER = 'u-player', GUARD = 'u-guardian', OTHER_GUARD = 'u-guardian-2'
const base = (): Tables => ({
  players: [
    { id: 'p1', coach_id: OWNER, user_id: PLAYER, guardian_id: 'g1', team_id: null },   // on team T via player_teams only
    { id: 'p2', coach_id: OWNER, user_id: null, guardian_id: null, team_id: 'T' },       // on team T via players.team_id
    { id: 'p3', coach_id: null, user_id: null, guardian_id: null, team_id: null },       // no coach, no team
  ],
  guardians: [{ id: 'g1', user_id: GUARD }, { id: 'g2', user_id: OTHER_GUARD }],
  player_teams: [{ player_id: 'p1', team_id: 'T' }],
  team_coaches: [{ team_id: 'T', coach_id: OWNER, role: 'organizer' }, { team_id: 'T', coach_id: ASST, role: 'assistant' }],
})

test('player, direct coach and linked guardian are allowed', async () => {
  const db = fakeDb(base())
  assert.deepEqual(await canViewPlayerContent(db, PLAYER, 'p1'), { allowed: true, via: 'player', teamCheck: 'skipped' })
  assert.deepEqual(await canViewPlayerContent(db, OWNER, 'p1'), { allowed: true, via: 'coach', teamCheck: 'skipped' })
  assert.deepEqual(await canViewPlayerContent(db, GUARD, 'p1'), { allowed: true, via: 'guardian', teamCheck: 'skipped' })
})

test('assistant coach on the team is allowed, via player_teams or players.team_id', async () => {
  const db = fakeDb(base())
  assert.deepEqual(await canViewPlayerContent(db, ASST, 'p1'), { allowed: true, via: 'team_coach', teamCheck: 'ok' })
  assert.deepEqual(await canViewPlayerContent(db, ASST, 'p2'), { allowed: true, via: 'team_coach', teamCheck: 'ok' })
})

test('off-team coach, another guardian, a stranger and signed-out users are refused', async () => {
  const db = fakeDb(base())
  assert.equal((await canViewPlayerContent(db, OFF, 'p1')).allowed, false)
  assert.equal((await canViewPlayerContent(db, OTHER_GUARD, 'p1')).allowed, false)
  assert.equal((await canViewPlayerContent(db, 'u-random', 'p2')).allowed, false)
  assert.equal((await canViewPlayerContent(db, null, 'p1')).allowed, false)
  assert.equal((await canViewPlayerContent(db, '', 'p1')).allowed, false)
})

test('a player with no coach and no team is not visible to arbitrary coaches', async () => {
  const db = fakeDb(base())
  assert.equal((await canViewPlayerContent(db, OWNER, 'p3')).allowed, false)
  assert.equal((await canViewPlayerContent(db, ASST, 'p3')).allowed, false)
})

test('unknown player or missing player id is refused', async () => {
  const db = fakeDb(base())
  assert.equal((await canViewPlayerContent(db, OWNER, 'nope')).allowed, false)
  assert.equal((await canViewPlayerContent(db, OWNER, undefined)).allowed, false)
})

test('team_coaches missing (018 not run): direct coach, player and guardian still work, assistants are refused', async () => {
  const db = fakeDb({ ...base(), team_coaches: 'missing' })
  assert.equal((await canViewPlayerContent(db, OWNER, 'p1')).allowed, true)
  assert.equal((await canViewPlayerContent(db, PLAYER, 'p1')).allowed, true)
  assert.equal((await canViewPlayerContent(db, GUARD, 'p1')).allowed, true)
  assert.deepEqual(await canViewPlayerContent(db, ASST, 'p1'), { allowed: false, teamCheck: 'unavailable' })
  assert.deepEqual(await canViewPlayerContent(db, OFF, 'p2'), { allowed: false, teamCheck: 'unavailable' })
})

test('player_teams missing too: falls back to players.team_id, then to direct rules', async () => {
  const db = fakeDb({ ...base(), player_teams: 'missing' })
  assert.equal((await canViewPlayerContent(db, ASST, 'p2')).allowed, true)  // players.team_id still works
  assert.equal((await canViewPlayerContent(db, ASST, 'p1')).allowed, false) // only linked via player_teams
  const none = fakeDb({ ...base(), player_teams: 'missing', team_coaches: 'missing' })
  assert.equal((await canViewPlayerContent(none, OWNER, 'p2')).allowed, true)
  assert.equal((await canViewPlayerContent(none, ASST, 'p2')).allowed, false)
})

test('directAccess never matches on null ids', () => {
  const p = { coach_id: null, user_id: null, guardian_id: null, team_id: null }
  assert.equal(directAccess('u', p, null), null)
  assert.equal(directAccess('', { ...p, coach_id: '' }, ''), null)
})
