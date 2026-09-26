/**
 * Tests for the player video consent rule (RP-041).
 * Run with: npx tsx src/lib/__tests__/consent.test.ts
 *
 * No database or network: the server-side checks get a mocked Supabase client.
 */

import {
  canUploadVideo,
  uploadConsentStatus,
  uploadBlockedCopy,
  UPLOAD_BLOCKED_MESSAGE,
  type PlayerConsentFields,
} from '../consent'
import { checkUploadConsent, canManagePlayerAge, setAdultConfirmation } from '../consent-server'

// ─── Minimal test harness (same style as ai-coach.test.ts) ─────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`)
    failed++
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
}

// ─── Mock Supabase client ─────────────────────────────────────────────────────
// Records every query and answers it from a per-table handler.

type Op = [method: string, args: unknown[]]
type Query = { table: string; ops: Op[] }
type Result = { data: unknown; error: { message: string; code?: string } | null }
type Handler = (q: Query) => Result

class MockQuery {
  constructor(private q: Query, private handler: Handler | undefined) {}
  private add(method: string, args: unknown[]) { this.q.ops.push([method, args]); return this }
  select(...a: unknown[]) { return this.add('select', a) }
  update(...a: unknown[]) { return this.add('update', a) }
  eq(...a: unknown[]) { return this.add('eq', a) }
  in(...a: unknown[]) { return this.add('in', a) }
  is(...a: unknown[]) { return this.add('is', a) }
  limit(...a: unknown[]) { return this.add('limit', a) }
  private result(): Result { return this.handler ? this.handler(this.q) : { data: null, error: null } }
  maybeSingle() { this.add('maybeSingle', []); return Promise.resolve(this.result()) }
  single() { this.add('single', []); return Promise.resolve(this.result()) }
  then<T1 = Result, T2 = never>(ok?: (r: Result) => T1 | PromiseLike<T1>, bad?: (e: unknown) => T2 | PromiseLike<T2>) {
    return Promise.resolve(this.result()).then(ok, bad)
  }
}

function mockDb(handlers: Record<string, Handler>) {
  const queries: Query[] = []
  const db = {
    from(table: string) {
      const q: Query = { table, ops: [] }
      queries.push(q)
      return new MockQuery(q, handlers[table])
    },
  }
  // The helpers only use `.from()`; cast the mock to that shape.
  return { db: db as unknown as Parameters<typeof checkUploadConsent>[0], queries }
}

const hasOp = (q: Query, method: string) => q.ops.some(([m]) => m === method)
const opArgs = (q: Query, method: string) => q.ops.find(([m]) => m === method)?.[1]

const T = '2026-09-01T12:00:00.000Z'
const COACH = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER_COACH = 'aaaaaaaa-0000-4000-8000-000000000002'
const PLAYER = 'bbbbbbbb-0000-4000-8000-000000000001'

async function main() {
  // ───────────────────────────────────────────────────────────────────────────
  section('canUploadVideo / uploadConsentStatus')

  const cases: { label: string; player: PlayerConsentFields | null | undefined; status: string; allowed: boolean }[] = [
    { label: 'confirmed adult', player: { adult_confirmed_at: T, consent_given_at: null }, status: 'adult_confirmed', allowed: true },
    { label: 'adult flag with no DOB or age_group', player: { adult_confirmed_at: T }, status: 'adult_confirmed', allowed: true },
    { label: 'minor with guardian consent', player: { adult_confirmed_at: null, consent_given_at: T }, status: 'guardian_consent', allowed: true },
    { label: 'adult flag and consent both set', player: { adult_confirmed_at: T, consent_given_at: T }, status: 'adult_confirmed', allowed: true },
    { label: 'minor, consent pending', player: { adult_confirmed_at: null, consent_given_at: null }, status: 'pending', allowed: false },
    { label: 'no status fields at all', player: {}, status: 'pending', allowed: false },
    { label: 'player row missing (null)', player: null, status: 'pending', allowed: false },
    { label: 'player row missing (undefined)', player: undefined, status: 'pending', allowed: false },
    { label: 'empty-string timestamps are not a status', player: { adult_confirmed_at: '', consent_given_at: '  ' }, status: 'pending', allowed: false },
    { label: 'garbage timestamp is not a status', player: { adult_confirmed_at: 'yes' }, status: 'pending', allowed: false },
  ]
  for (const c of cases) {
    assert(uploadConsentStatus(c.player) === c.status, `${c.label}: status ${c.status}`, `got ${uploadConsentStatus(c.player)}`)
    assert(canUploadVideo(c.player) === c.allowed, `${c.label}: ${c.allowed ? 'allowed' : 'blocked'}`)
  }

  // age_group is not used to infer age: an "adult" group without the flag is still blocked.
  const adultGroupNoFlag = { age_group: 'Professional', adult_confirmed_at: null, consent_given_at: null }
  assert(!canUploadVideo(adultGroupNoFlag), 'age_group "Professional" without a stored status is blocked')

  // ───────────────────────────────────────────────────────────────────────────
  section('Blocked copy')

  const coachCopy = uploadBlockedCopy('coach')
  assert(coachCopy.message === UPLOAD_BLOCKED_MESSAGE, 'coach message is the shared blocked message')
  assert(/18\+/.test(coachCopy.nextStep), 'coach next step mentions marking 18+')
  const playerCopy = uploadBlockedCopy('player')
  assert(/your account/.test(playerCopy.message), 'player message addresses the player')
  assert(/coach/.test(playerCopy.nextStep), 'player next step points to the coach')

  // ───────────────────────────────────────────────────────────────────────────
  section('checkUploadConsent (server refusal path, mocked client)')

  {
    const { db, queries } = mockDb({ players: () => ({ data: { adult_confirmed_at: null, consent_given_at: null }, error: null }) })
    const r = await checkUploadConsent(db, PLAYER)
    assert(!r.ok, 'pending player is refused')
    assert(!r.ok && r.error === UPLOAD_BLOCKED_MESSAGE, 'refusal returns the plain blocked message')
    const q = queries[0]
    assert(q?.table === 'players', 'reads the players table')
    assert(JSON.stringify(opArgs(q, 'select')) === JSON.stringify(['adult_confirmed_at, consent_given_at']), 'selects only the consent columns')
    assert(JSON.stringify(opArgs(q, 'eq')) === JSON.stringify(['id', PLAYER]), 'filters by player id')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { adult_confirmed_at: T, consent_given_at: null }, error: null }) })
    assert((await checkUploadConsent(db, PLAYER)).ok, 'confirmed adult is allowed')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { adult_confirmed_at: null, consent_given_at: T }, error: null }) })
    assert((await checkUploadConsent(db, PLAYER)).ok, 'minor with consent is allowed')
  }
  {
    const { db } = mockDb({ players: () => ({ data: null, error: null }) })
    const r = await checkUploadConsent(db, PLAYER)
    assert(!r.ok && r.error === 'Player not found', 'unknown player is refused')
  }
  {
    const origError = console.error
    console.error = () => {}
    const { db } = mockDb({ players: () => ({ data: null, error: { message: 'column "adult_confirmed_at" does not exist', code: '42703' } }) })
    const r = await checkUploadConsent(db, PLAYER)
    console.error = origError
    assert(!r.ok, 'DB error fails closed (refused)')
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('setAdultConfirmation authorization (mocked client)')

  {
    const { db, queries } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: null } : { data: { coach_id: COACH }, error: null }),
    })
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('success' in r, "player's coach can mark 18+")
    const upd = queries.find((q) => hasOp(q, 'update'))
    const fields = (opArgs(upd!, 'update')?.[0] ?? {}) as Record<string, unknown>
    assert(typeof fields.adult_confirmed_at === 'string' && !Number.isNaN(Date.parse(fields.adult_confirmed_at as string)), 'sets adult_confirmed_at to a timestamp')
    assert(fields.adult_confirmed_by === COACH, 'records who confirmed')
    assert(JSON.stringify(opArgs(upd!, 'eq')) === JSON.stringify(['id', PLAYER]), 'updates only that player')
  }
  {
    const { db, queries } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: null } : { data: { coach_id: COACH }, error: null }),
    })
    const r = await setAdultConfirmation(db, COACH, PLAYER, false)
    const upd = queries.find((q) => hasOp(q, 'update'))
    const fields = (opArgs(upd!, 'update')?.[0] ?? {}) as Record<string, unknown>
    assert('success' in r && fields.adult_confirmed_at === null && fields.adult_confirmed_by === null, 'coach can clear the 18+ flag')
  }
  {
    const { db, queries } = mockDb({ players: () => ({ data: { coach_id: COACH }, error: null }) })
    const r = await setAdultConfirmation(db, OTHER_COACH, PLAYER, true)
    assert('error' in r && r.error === 'Not authorized', "another coach is refused")
    assert(!queries.some((q) => hasOp(q, 'update')), 'no update is attempted when refused')
  }
  {
    const { db, queries } = mockDb({ players: () => ({ data: null, error: null }) })
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('error' in r && !queries.some((q) => hasOp(q, 'update')), 'unknown player is refused')
  }
  {
    // Coach-less player on a team the caller owns.
    const { db } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: null } : { data: { coach_id: null }, error: null }),
      player_teams: () => ({ data: [{ team_id: 't1' }], error: null }),
      teams: (q) => ({ data: JSON.stringify(opArgs(q, 'eq')) === JSON.stringify(['coach_id', COACH]) ? [{ id: 't1' }] : [], error: null }),
    })
    assert(await canManagePlayerAge(db, COACH, PLAYER), "coach-less player on the caller's team: allowed")
    assert(!(await canManagePlayerAge(db, OTHER_COACH, PLAYER)), "coach-less player on someone else's team: refused")
  }
  {
    const { db } = mockDb({
      players: () => ({ data: { coach_id: null }, error: null }),
      player_teams: () => ({ data: [], error: null }),
    })
    assert(!(await canManagePlayerAge(db, COACH, PLAYER)), 'coach-less player on no team: refused')
  }
  {
    const { db } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: { message: 'boom' } } : { data: { coach_id: COACH }, error: null }),
    })
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('error' in r && r.error === 'boom', 'update errors are returned')
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('Results')

  const total = passed + failed
  console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
