/**
 * saveHittingMetrics: the direct coach or the player may save (service role
 * after the check); team coaches and others are refused; a failed or no-op
 * update is a friendly error (raw error only in the server log), never success.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/hitting-save.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { saveHittingMetrics } from '../../../app/actions/clips'

const P = 'player-1', C = 'clip-1'
const COACH = { id: 'coach', email: 'c@example.com' }
const PLAYER = { id: 'player-user', email: 'p@example.com' }
const TEAM_COACH = { id: 'team-coach', email: 't@example.com' }
const STRANGER = { id: 'stranger', email: 's@example.com' }
const HIT = { ev_avg: 88.1, ev_max: 97.4, launch_angle_avg: 14, barrel_rate: null, hard_hit_rate: 41, sweet_spot_rate: null, attack_angle: null, bat_speed: 66 }

function seed(user: { id: string; email: string } | null) {
  resetFake({
    user,
    tables: {
      clips: [{ id: C, player_id: P, hitting_metrics: null }],
      players: [{ id: P, coach_id: COACH.id, user_id: PLAYER.id, team_id: 'team-1' }],
      team_coaches: [{ team_id: 'team-1', coach_id: TEAM_COACH.id, role: 'assistant' }],
    },
  })
}
const saved = () => state.tables.clips[0].hitting_metrics
const writes = () => state.ops.filter(o => o.action !== 'select')
const captureErrors = async <T>(f: () => Promise<T>) => {
  const logged: unknown[][] = []; const e = console.error; console.error = (...a: unknown[]) => { logged.push(a) }
  try { return { r: await f(), logged } } finally { console.error = e }
}

test('direct coach and the player save hitting data', async () => {
  for (const user of [COACH, PLAYER]) {
    seed(user)
    assert.deepEqual(await saveHittingMetrics(C, HIT), { success: true }, user.id)
    assert.deepEqual(saved(), HIT)
    assert.ok(state.revalidated.includes(`/clips/${C}`))
  }
})

test('team coach, stranger and signed-out user are refused with a friendly message; nothing written', async () => {
  for (const [user, re] of [[TEAM_COACH, /Only the player's coach or the player/], [STRANGER, /Only the player's coach or the player/], [null, /sign in/]] as const) {
    seed(user)
    const r = await saveHittingMetrics(C, HIT) as { error?: string }
    assert.match(String(r.error), re, user?.id ?? 'anon')
    assert.deepEqual(writes(), []); assert.equal(saved(), null)
  }
  seed(COACH)
  assert.match(String((await saveHittingMetrics('nope', HIT) as { error?: string }).error), /no longer exists/)
})

test('a failed update: friendly error in production, raw error logged on the server only', async () => {
  seed(COACH)
  fail({ table: 'clips', action: 'update', error: { code: '23514', message: 'new row for relation "clips" violates check constraint "clips_hitting_chk"' } })
  const env = process.env.NODE_ENV
  ;(process.env as Record<string, string>).NODE_ENV = 'production'
  let out
  try { out = await captureErrors(() => saveHittingMetrics(C, HIT)) } finally { (process.env as Record<string, string | undefined>).NODE_ENV = env }
  const err = String((out.r as { error?: string }).error)
  assert.match(err, /^Couldn't save the hitting data\./)
  assert.doesNotMatch(err, /clips_hitting_chk|violates|relation/)
  assert.ok(JSON.stringify(out.logged).includes('clips_hitting_chk'), 'raw error logged')
  assert.equal(saved(), null)
})

test('an update that changes no row is an error, not a success', async () => {
  seed(COACH)
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  const from = supabaseAdmin.from
  supabaseAdmin.from = (t: string) => { const q = from(t); if (t === 'clips') { const upd = q.update.bind(q); q.update = (v: unknown) => { const r = upd(v); r.eq('id', '__none__'); return r } } return q }
  try {
    const { r } = await captureErrors(() => saveHittingMetrics(C, HIT))
    assert.match(String((r as { error?: string }).error), /Couldn't save the hitting data/)
  } finally { supabaseAdmin.from = from }
})
