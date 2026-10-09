/**
 * CSV and TrackMan PDF pitch imports (importPitchMetrics). After migration 035
 * only a player's direct coach passes pitch_metrics_coach_all, so the import
 * moved from a browser insert (the user's session, refused by RLS for players
 * and team coaches) to this server action: the same access rule as
 * addPitchMetric (direct coach, or the player on their own clip), validation
 * again on the server, then ONE service-role insert (all-or-nothing).
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/pitch-import.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { importPitchMetrics } from '../../../app/actions/clips'
import { supabaseAdmin } from './fakes/supabase-admin'
import { readPitchCsv } from '../../pitch-csv'
import { csvImportFrom, MAX_IMPORT_ROWS, type PdfImportRow } from '../../pitch-import'

const P = 'player-1', C = 'clip-1'
const COACH = { id: 'coach', email: 'c@example.com' }
const PLAYER = { id: 'player-user', email: 'p@example.com' }
const TEAM_COACH = { id: 'team-coach', email: 't@example.com' }   // on the player's team, not players.coach_id
const STRANGER = { id: 'stranger', email: 's@example.com' }

function seed(user: { id: string; email: string } | null) {
  resetFake({
    user,
    tables: {
      clips: [{ id: C, player_id: P }],
      players: [{ id: P, coach_id: COACH.id, user_id: PLAYER.id, team_id: 'team-1' }],
      team_coaches: [{ team_id: 'team-1', coach_id: TEAM_COACH.id, role: 'assistant' }],
      pitch_metrics: [],
    },
  })
}
const CSV = 'Pitch Type,Velocity,Spin Rate,Spin Axis,Horz Break,Induced Vert Break,Extension\nFastball,89.1,2250,1:15,8.1,18.7,6.4\nSlider,81.0,2500,9:00,-6,2,6.1\nChangeUp,82.3,1700,2:00,12,9,6.3\n'
const csvPayload = (text = CSV) => { const r = readPitchCsv(text); assert.ok(r.ok); return csvImportFrom(r.rows) }
const PDF: PdfImportRow[] = [
  { pitch_type: 'Fastball', velocity: 90.2, spin_rate: 2300, spin_axis: 37.5, horizontal_break: 9, vertical_break: 17 },
  { pitch_type: 'Curveball', velocity: 75, spin_rate: 2600, spin_axis: null, horizontal_break: -8, vertical_break: -12 },
]
const writes = () => state.ops.filter(o => o.action !== 'select')
const quiet = async <T>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await f() } finally { console.error = e } }

test('direct coach imports a CSV: one service-role insert with every row, returned for the table', async () => {
  seed(COACH)
  const r = await importPitchMetrics(C, csvPayload())
  assert.ok('metrics' in r, JSON.stringify(r))
  assert.equal(r.metrics.length, 3)
  const ins = writes()
  assert.equal(ins.length, 1, 'one batch insert')
  assert.equal(ins[0].via, 'admin'); assert.equal(ins[0].table, 'pitch_metrics')
  assert.equal((ins[0].values as unknown[]).length, 3)
  const rows = state.tables.pitch_metrics
  assert.deepEqual(rows.map(x => x.pitch_type), ['Fastball', 'Slider', 'ChangeUp'])
  assert.ok(rows.every(x => x.clip_id === C && x.created_by === COACH.id))
  assert.equal(rows[0].spin_axis, 37.5); assert.equal(rows[0].extension, 6.4)
  assert.deepEqual(rows[0].raw_data, { 'Pitch Type': 'Fastball', Velocity: '89.1', 'Spin Rate': '2250', 'Spin Axis': '1:15', 'Horz Break': '8.1', 'Induced Vert Break': '18.7', Extension: '6.4' })
  assert.ok(!('release_height' in rows[0]))
  assert.ok(state.revalidated.includes(`/clips/${C}`))
})

test('the player imports a TrackMan PDF on their own clip', async () => {
  seed(PLAYER)
  const r = await importPitchMetrics(C, { source: 'pdf', rows: PDF })
  assert.ok('metrics' in r, JSON.stringify(r))
  assert.equal(r.metrics.length, 2)
  assert.deepEqual(state.tables.pitch_metrics.map(x => [x.pitch_type, x.created_by, x.clip_id]), [['Fastball', PLAYER.id, C], ['Curveball', PLAYER.id, C]])
  assert.ok(!('extension' in state.tables.pitch_metrics[0]), 'PDF rows insert the same columns as before')
})

test('a team coach on the player\'s team can import', async () => {
  seed(TEAM_COACH)
  const r = await importPitchMetrics(C, csvPayload())
  assert.ok('metrics' in r, JSON.stringify(r))
  assert.equal(r.metrics.length, 3)
})

test('a stranger and a signed-out user are refused; nothing is written', async () => {
  for (const [user, re] of [[STRANGER, /Only the player's coach or the player/], [null, /sign in/]] as const) {
    for (const input of [csvPayload(), { source: 'pdf' as const, rows: PDF }]) {
      seed(user)
      const r = await importPitchMetrics(C, input)
      assert.ok('error' in r && re.test(r.error), `${user?.id ?? 'anon'}: ${JSON.stringify(r)}`)
      assert.deepEqual(writes(), [], `${user?.id ?? 'anon'}: no writes`)
      assert.deepEqual(state.tables.pitch_metrics, [])
    }
  }
})

test('unknown clip -> friendly error; a failed access lookup is an error, not a success', async () => {
  seed(COACH)
  const r = await importPitchMetrics('nope', csvPayload())
  assert.ok('error' in r && /no longer exists/.test(r.error))
  seed(COACH)
  fail({ table: 'clips', action: 'select', error: { message: 'boom' } })
  const r2 = await quiet(() => importPitchMetrics(C, csvPayload()))
  assert.ok('error' in r2 && /Couldn't check access/.test(r2.error) && !r2.error.includes('boom'))
  assert.deepEqual(writes(), [])
})

test('validation runs on the server: bad cells, bad axis, wrong shape, too many rows -> refused, nothing saved', async () => {
  const good = csvPayload()
  const cases: [string, unknown, RegExp][] = [
    ['non-number cell', { ...good, rows: [good.rows[0], good.rows[1].map((c, i) => (i === 1 ? 'fast' : c))] }, /Pitch 2: Velocity "fast" isn't a number\. Nothing was saved/],
    ['no pitch type or velocity', { ...good, rows: [good.headers.map(() => '')] }, /no pitch type or velocity/],
    ['cells/header mismatch', { ...good, rows: [good.rows[0].slice(1)] }, /Pitch 1 couldn't be read/],
    ['empty', { ...good, rows: [] }, /Nothing to import/],
    ['unknown source', { source: 'xls', rows: good.rows }, /Nothing to import/],
    ['too many rows', { ...good, rows: Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => good.rows[0]) }, /import up to 2000/],
    ['PDF axis out of range', { source: 'pdf', rows: [{ ...PDF[0], spin_axis: 400 }] }, /Axis must be a clock time/],
    ['PDF non-number', { source: 'pdf', rows: [PDF[0], { ...PDF[1], velocity: 'NaN' }] }, /Pitch type 2: velocity isn't a number/],
    ['PDF no pitch type', { source: 'pdf', rows: [{ ...PDF[0], pitch_type: ' ' }] }, /no pitch type/],
  ]
  for (const [name, input, re] of cases) {
    seed(COACH)
    const r = await importPitchMetrics(C, input as never)
    assert.ok('error' in r && re.test(r.error), `${name}: ${JSON.stringify(r).slice(0, 300)}`)
    assert.deepEqual(writes(), [], `${name}: no writes`)
  }
})

test('the client cannot choose clip_id / created_by or extra columns', async () => {
  seed(PLAYER)
  const r = await importPitchMetrics(C, { source: 'pdf', rows: [{ ...PDF[0], clip_id: 'other-clip', created_by: COACH.id, id: 'x' } as PdfImportRow] })
  assert.ok('metrics' in r)
  const row = state.tables.pitch_metrics[0]
  assert.equal(row.clip_id, C); assert.equal(row.created_by, PLAYER.id); assert.notEqual(row.id, 'x')
})

test('a failed insert saves nothing and shows a friendly message (no raw DB text in production)', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'insert', error: { code: '42501', message: 'new row violates row-level security policy for table "pitch_metrics"' } })
  const env = process.env.NODE_ENV
  ;(process.env as Record<string, string>).NODE_ENV = 'production'
  let r
  try { r = await quiet(() => importPitchMetrics(C, csvPayload())) } finally { (process.env as Record<string, string | undefined>).NODE_ENV = env }
  assert.ok('error' in r && /Nothing was saved/.test(r.error), JSON.stringify(r))
  assert.doesNotMatch(r.error, /row-level|pitch_metrics/)
  assert.deepEqual(state.tables.pitch_metrics, [])
})

test('before 020 (integer spin_axis): one retry with whole degrees, saved with a warning', async () => {
  seed(COACH)
  fail({ table: 'pitch_metrics', action: 'insert', times: 1, error: { code: '22P02', message: 'invalid input syntax for type integer: "37.5"' } })
  const r = await quiet(() => importPitchMetrics(C, csvPayload()))
  assert.ok('metrics' in r && /rounded to whole degrees/.test(r.warning ?? ''), JSON.stringify(r))
  assert.equal(writes().length, 2)
  assert.ok(state.tables.pitch_metrics.every(x => x.spin_axis == null || Number.isInteger(x.spin_axis)))
})

test('fewer rows confirmed than sent is reported with a clear count, never as success', async () => {
  seed(COACH)
  // Simulate an insert that confirms only 2 of the 3 rows.
  const from = supabaseAdmin.from
  supabaseAdmin.from = (table: string) => {
    const q = from(table)
    if (table !== 'pitch_metrics') return q
    const select = q.select.bind(q)
    q.select = (cols: string) => ({ then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      select(cols).then((r: { data: unknown[] }) => ({ ...r, data: r.data.slice(0, 2) })).then(ok, ko) })
    return q
  }
  try {
    const r = await quiet(() => importPitchMetrics(C, csvPayload()))
    assert.ok('error' in r && /Only 2 of 3 pitches were confirmed saved/.test(r.error), JSON.stringify(r))
  } finally { supabaseAdmin.from = from }
})
