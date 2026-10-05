/**
 * Tests for the player video rule (RP-041; age bands, migration 037).
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
import {
  checkUploadConsent, canManagePlayerAge, setAdultConfirmation,
  isMissingConsentColumn, selectPlayersWithConsent, writeWithAdultFields,
} from '../consent-server'
import { canUploadForPlayerWith } from '../auth/upload-access'

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

  // With 037: only a confirmed 13_17 or 18_plus band allows video.
  const pre037 = { age_band_pending_migration: true }
  const cases: { label: string; player: PlayerConsentFields | null | undefined; status: string; allowed: boolean }[] = [
    { label: '18_plus confirmed', player: { age_band: '18_plus', age_confirmed_at: T }, status: 'adult_confirmed', allowed: true },
    { label: '13_17 confirmed', player: { age_band: '13_17', age_confirmed_at: T }, status: 'age_confirmed', allowed: true },
    { label: 'under_13 (hard stop)', player: { age_band: 'under_13', age_confirmed_at: T }, status: 'pending', allowed: false },
    { label: 'under_13 with consent_given_at (old one-click consent)', player: { age_band: 'under_13', age_confirmed_at: T, consent_given_at: T }, status: 'pending', allowed: false },
    { label: 'unknown band with consent_given_at', player: { age_band: null, consent_given_at: T }, status: 'pending', allowed: false },
    { label: 'unknown band with a stray adult flag', player: { age_band: null, adult_confirmed_at: T }, status: 'pending', allowed: false },
    { label: 'band without confirmation time', player: { age_band: '18_plus', age_confirmed_at: null }, status: 'pending', allowed: false },
    { label: 'unknown band', player: { age_band: null }, status: 'pending', allowed: false },
    { label: 'no status fields at all', player: {}, status: 'pending', allowed: false },
    { label: 'player row missing (null)', player: null, status: 'pending', allowed: false },
    { label: 'player row missing (undefined)', player: undefined, status: 'pending', allowed: false },
    { label: 'garbage band', player: { age_band: 'adult', age_confirmed_at: T }, status: 'pending', allowed: false },
    // Before 037: 023's rule (as its trigger).
    { label: 'pre-037: confirmed adult', player: { ...pre037, adult_confirmed_at: T, consent_given_at: null }, status: 'adult_confirmed', allowed: true },
    { label: 'pre-037: consent on file', player: { ...pre037, adult_confirmed_at: null, consent_given_at: T }, status: 'guardian_consent', allowed: true },
    { label: 'pre-037: neither', player: { ...pre037, adult_confirmed_at: null, consent_given_at: null }, status: 'pending', allowed: false },
    { label: 'pre-037: empty-string timestamps are not a status', player: { ...pre037, adult_confirmed_at: '', consent_given_at: '  ' }, status: 'pending', allowed: false },
    { label: 'pre-037: garbage timestamp is not a status', player: { ...pre037, adult_confirmed_at: 'yes' }, status: 'pending', allowed: false },
  ]
  for (const c of cases) {
    assert(uploadConsentStatus(c.player) === c.status, `${c.label}: status ${c.status}`, `got ${uploadConsentStatus(c.player)}`)
    assert(canUploadVideo(c.player) === c.allowed, `${c.label}: ${c.allowed ? 'allowed' : 'blocked'}`)
  }

  // age_group alone sets nothing here: the database turns an under-13 age
  // group into the under_13 band (037); an "adult" group without a band is blocked.
  const adultGroupNoFlag = { age_group: 'Professional', age_band: null }
  assert(!canUploadVideo(adultGroupNoFlag), 'age_group "Professional" without a band is blocked')

  // ───────────────────────────────────────────────────────────────────────────
  section('Blocked copy')

  const coachCopy = uploadBlockedCopy('coach')
  assert(/age isn't confirmed/.test(coachCopy.message), 'coach message: age not confirmed')
  assert(/under 13, 13 to 17, or 18 or older/.test(coachCopy.nextStep), 'coach next step: pick a band')
  const coach13 = uploadBlockedCopy('coach', { reason: 'under_13' })
  assert(/under 13/.test(coach13.message) && /coming soon/.test(coach13.nextStep), 'coach under-13 copy: parent consent coming soon')
  const playerCopy = uploadBlockedCopy('player')
  assert(/^Your age/.test(playerCopy.message), 'player message addresses the player')
  assert(/coach/.test(playerCopy.nextStep), 'player next step points to the coach')
  assert(uploadBlockedCopy('player', { reason: 'under_13' }).message === "We need a parent's permission first. Ask your coach.", 'under-13 player copy is the stop message')

  // ───────────────────────────────────────────────────────────────────────────
  section('checkUploadConsent (server refusal path, mocked client)')

  {
    const { db, queries } = mockDb({ players: () => ({ data: { age_band: null, age_confirmed_at: null, adult_confirmed_at: null, consent_given_at: null }, error: null }) })
    const r = await checkUploadConsent(db, PLAYER)
    assert(!r.ok, 'pending player is refused')
    assert(!r.ok && r.error === UPLOAD_BLOCKED_MESSAGE, 'refusal returns the plain blocked message')
    const q = queries[0]
    assert(q?.table === 'players', 'reads the players table')
    assert(JSON.stringify(opArgs(q, 'select')) === JSON.stringify(['id, adult_confirmed_at, consent_given_at, age_band, age_confirmed_at, age_band_coach, age_band_self, age_screen_at']), 'selects the consent and age columns')
    assert(JSON.stringify(opArgs(q, 'eq')) === JSON.stringify(['id', PLAYER]), 'filters by player id')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { age_band: '18_plus', age_confirmed_at: T, adult_confirmed_at: T }, error: null }) })
    assert((await checkUploadConsent(db, PLAYER)).ok, '18_plus is allowed')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { age_band: '13_17', age_confirmed_at: T }, error: null }) })
    assert((await checkUploadConsent(db, PLAYER)).ok, '13_17 is allowed')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { age_band: 'under_13', age_confirmed_at: T, consent_given_at: T }, error: null }) })
    assert(!(await checkUploadConsent(db, PLAYER)).ok, 'under_13 is refused, even with consent_given_at')
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
      players: (q) => (hasOp(q, 'update') ? { data: [{ age_band: '18_plus' }], error: null } : { data: { id: PLAYER, coach_id: COACH, user_id: null, age_group: null, team_id: null, age_band_self: null }, error: null }),
    })
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('success' in r, "player's coach can mark 18+")
    const upd = queries.find((q) => hasOp(q, 'update'))
    const fields = (opArgs(upd!, 'update')?.[0] ?? {}) as Record<string, unknown>
    assert(typeof fields.adult_confirmed_at === 'string' && !Number.isNaN(Date.parse(fields.adult_confirmed_at as string)), 'sets adult_confirmed_at to a timestamp')
    assert(fields.adult_confirmed_by === COACH, 'records who confirmed')
    assert(fields.age_band_coach === '18_plus' && fields.age_band === '18_plus' && fields.age_band_source === 'coach', "stores the coach's answer and the effective band")
    assert(JSON.stringify(opArgs(upd!, 'eq')) === JSON.stringify(['id', PLAYER]), 'updates only that player')
  }
  {
    const { db, queries } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: [{ age_band: null }], error: null } : { data: { id: PLAYER, coach_id: COACH, age_band_self: null }, error: null }),
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
    // Coach-less player on a team the caller owns: still refused (own coach only).
    const { db, queries } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: null } : { data: { coach_id: null }, error: null }),
      player_teams: () => ({ data: [{ team_id: 't1' }], error: null }),
      teams: () => ({ data: [{ id: 't1' }], error: null }),
    })
    assert(!(await canManagePlayerAge(db, COACH, PLAYER)), "coach-less player on the caller's team: refused")
    assert(!(await canManagePlayerAge(db, OTHER_COACH, PLAYER)), "coach-less player on someone else's team: refused")
    assert(!queries.some((q) => q.table === 'player_teams' || q.table === 'teams'), 'team membership is not consulted')
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('error' in r && r.error === 'Not authorized' && !queries.some((q) => hasOp(q, 'update')), 'setAdultConfirmation refuses a team coach of a coach-less player')
  }
  {
    const { db } = mockDb({
      players: () => ({ data: { coach_id: null }, error: null }),
      player_teams: () => ({ data: [], error: null }),
    })
    assert(!(await canManagePlayerAge(db, COACH, PLAYER)), 'coach-less player on no team: refused')
  }
  {
    const { db } = mockDb({ players: () => ({ data: { coach_id: COACH }, error: null }) })
    assert(await canManagePlayerAge(db, COACH, PLAYER), 'own coach: allowed')
    assert(!(await canManagePlayerAge(db, 'cccccccc-0000-4000-8000-000000000001', PLAYER)), 'the player themself: refused')
  }
  {
    const { db } = mockDb({
      players: (q) => (hasOp(q, 'update') ? { data: null, error: { message: 'boom' } } : { data: { coach_id: COACH }, error: null }),
    })
    const r = await setAdultConfirmation(db, COACH, PLAYER, true)
    assert('error' in r && /Couldn't save the player's 18\+ status/.test(r.error) && !r.error.includes('boom'), 'update errors are refused with friendly copy (raw error logged, not shown)', JSON.stringify(r))
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('canUploadForPlayer (who may upload, mocked client)')

  {
    const canUploadForPlayer = (userId: string, playerId: string, db: Parameters<typeof canUploadForPlayerWith>[0]) =>
      canUploadForPlayerWith(db, userId, playerId)
    const PLAYER_USER = 'cccccccc-0000-4000-8000-000000000001'
    const withRow = (row: unknown) => mockDb({
      players: () => ({ data: row, error: null }),
      // Any profile lookup would mean the old "any coach" rule is back.
      profiles: () => ({ data: { role: 'coach' }, error: null }),
    })

    const own = withRow({ coach_id: COACH, user_id: PLAYER_USER })
    assert(await canUploadForPlayer(COACH, PLAYER, own.db), "player's own coach: allowed")
    assert(await canUploadForPlayer(PLAYER_USER, PLAYER, own.db), 'the player themself: allowed')
    assert(!(await canUploadForPlayer(OTHER_COACH, PLAYER, own.db)), 'another coach: refused')

    const coachless = withRow({ coach_id: null, user_id: PLAYER_USER })
    assert(!(await canUploadForPlayer(OTHER_COACH, PLAYER, coachless.db)), 'any coach for a coach-less player: refused')
    assert(!coachless.queries.some((q) => q.table === 'profiles'), 'no role lookup (coach role grants nothing)')
    assert(await canUploadForPlayer(PLAYER_USER, PLAYER, coachless.db), 'coach-less player uploading for themself: allowed')

    const unlinked = withRow({ coach_id: null, user_id: null })
    assert(!(await canUploadForPlayer(COACH, PLAYER, unlinked.db)), 'no coach and no linked account: refused')

    const missing = withRow(null)
    assert(!(await canUploadForPlayer(COACH, PLAYER, missing.db)), 'unknown player: refused')
    assert(!(await canUploadForPlayer('', PLAYER, own.db)), 'empty user id: refused')
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('Before migration 023 (adult columns missing)')
  {
    // What PostgREST returns when a select names a column that doesn't exist
    // (42703), and when a write does (PGRST204).
    const missingSelect = { code: '42703', message: 'column players.adult_confirmed_at does not exist' }
    const missingWrite = { code: 'PGRST204', message: "Could not find the 'adult_confirmed_at' column of 'players' in the schema cache" }
    const missingBy = { code: 'PGRST204', message: "Could not find the 'adult_confirmed_by' column of 'players' in the schema cache" }
    const otherMissing = { code: '42703', message: 'column players.height does not exist' }

    assert(isMissingConsentColumn(missingSelect), 'detects 42703 for adult_confirmed_at')
    assert(isMissingConsentColumn(missingWrite) && isMissingConsentColumn(missingBy), 'detects PGRST204 for adult_confirmed_at / _by')
    assert(!isMissingConsentColumn(otherMissing), 'a different missing column is not treated as 023 missing')
    assert(!isMissingConsentColumn({ code: '42501', message: 'permission denied' }) && !isMissingConsentColumn(null), 'other errors / no error: not missing')

    // A players table without 023's columns: any select naming them fails.
    const pre023 = (row: Record<string, unknown> | null) => mockDb({
      players: (q) => {
        const sel = String(opArgs(q, 'select')?.[0] ?? '')
        if (sel.includes('adult_confirmed')) return { data: null, error: missingSelect }
        return { data: row, error: null }
      },
    })

    // Uploads behave as before the consent rule.
    {
      const { db, queries } = pre023({ id: PLAYER })
      const r = await checkUploadConsent(db, PLAYER)
      assert(r.ok, 'checkUploadConsent: allowed before 023 (not blocked)', JSON.stringify(r))
      assert(queries.length === 2, 'checkUploadConsent: retried without the consent columns')
    }
    {
      const { db } = pre023(null)
      const r = await checkUploadConsent(db, PLAYER)
      assert(!r.ok && r.error === 'Player not found', 'checkUploadConsent before 023: unknown player still refused')
    }
    {
      const { db } = mockDb({ players: () => ({ data: null, error: otherMissing }) })
      const r = await checkUploadConsent(db, PLAYER)
      assert(!r.ok, 'checkUploadConsent: any other schema error still fails closed')
    }

    // Reads: retried without the columns; rows marked; player not confirmed.
    {
      const { db, queries } = pre023({ id: PLAYER, full_name: 'P', consent_given_at: null })
      const r = await selectPlayersWithConsent<Record<string, unknown> & PlayerConsentFields>(
        'id, full_name',
        (cols) => db.from('players').select(cols).eq('id', PLAYER).single(),
      )
      assert(r.error === null && !!r.data, 'single-row read succeeds before 023', JSON.stringify(r))
      assert(JSON.stringify(opArgs(queries[1], 'select')) === JSON.stringify(['id, full_name, consent_given_at']), 'retry selects the base columns plus consent_given_at')
      assert(r.data?.adult_confirmed_at === null, 'player is treated as not confirmed 18+')
      assert(r.data?.consent_rules_pending_migration === true, 'row is marked: consent rules pending migration')
      assert(uploadConsentStatus(r.data) === 'rules_not_active' && canUploadVideo(r.data), 'upload buttons stay available (as on main)')
    }
    {
      const { db } = mockDb({
        players: (q) => String(opArgs(q, 'select')?.[0]).includes('adult_confirmed')
          ? { data: null, error: missingSelect }
          : { data: [{ id: 'a' }, { id: 'b' }], error: null },
      })
      const r = await selectPlayersWithConsent<(Record<string, unknown> & PlayerConsentFields)[]>(
        'id', (cols) => db.from('players').select(cols).in('id', ['a', 'b']),
      )
      assert(Array.isArray(r.data) && r.data.length === 2, 'list read keeps every player (no empty roster)')
      assert(!!r.data?.every((p) => p.consent_rules_pending_migration === true && p.adult_confirmed_at === null), 'every listed player marked')
    }
    {
      const { db, queries } = mockDb({ players: () => ({ data: { id: PLAYER, adult_confirmed_at: null, consent_given_at: null }, error: null }) })
      const r = await selectPlayersWithConsent<PlayerConsentFields>('id', (cols) => db.from('players').select(cols).single())
      assert(queries.length === 1 && JSON.stringify(opArgs(queries[0], 'select')) === JSON.stringify(['id, adult_confirmed_at, consent_given_at, age_band, age_confirmed_at, age_band_coach, age_band_self, age_screen_at']), 'after 037: one query with the consent and age columns')
      assert(!r.data?.consent_rules_pending_migration && !canUploadVideo(r.data), 'after 023: the rule applies (pending player blocked)')
    }
    {
      const { db, queries } = mockDb({ players: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) })
      const r = await selectPlayersWithConsent('id', (cols) => db.from('players').select(cols).single())
      assert(queries.length === 1 && r.error?.code === '42501', 'other read errors are returned, not retried')
    }

    // Writes: signup / invite retried without the adult fields.
    {
      const calls: Record<string, unknown>[] = []
      const r = await writeWithAdultFields({ adult_confirmed_at: T, adult_confirmed_by: COACH }, async (fields) => {
        calls.push(fields)
        return 'adult_confirmed_at' in fields ? { data: null, error: missingWrite } : { data: { id: PLAYER }, error: null }
      })
      assert(calls.length === 2 && Object.keys(calls[1]).length === 0, 'write retried without the adult fields')
      assert(r.error === null && (r.data as { id: string }).id === PLAYER, 'player row still created (signup / invite work)')
    }
    {
      const calls: Record<string, unknown>[] = []
      await writeWithAdultFields({}, async (fields) => { calls.push(fields); return { data: null, error: missingWrite } })
      assert(calls.length === 1, 'no adult fields: no retry')
      const calls2: Record<string, unknown>[] = []
      const r = await writeWithAdultFields({ adult_confirmed_at: T }, async (fields) => { calls2.push(fields); return { data: null, error: { code: '23505', message: 'duplicate' } } })
      assert(calls2.length === 1 && r.error?.code === '23505', 'other write errors (e.g. duplicate) are returned as-is')
    }

    // Marking 18+ reports that the update is pending instead of a raw error.
    {
      const missingBand = { code: '42703', message: 'column players.age_band_self does not exist' }
      const { db } = mockDb({
        players: (q) => hasOp(q, 'update') ? { data: null, error: missingWrite }
          : String(opArgs(q, 'select')?.[0]).includes('age_band_self') ? { data: null, error: missingBand }
          : { data: { coach_id: COACH }, error: null },
      })
      const r = await setAdultConfirmation(db, COACH, PLAYER, true)
      assert('error' in r && /isn't available yet/.test(r.error), 'setAdultConfirmation before 023: clear message', JSON.stringify(r))
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('Results')

  const total = passed + failed
  console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
