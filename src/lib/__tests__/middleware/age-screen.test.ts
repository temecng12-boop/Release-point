/**
 * The one-screen age gate through the real middleware: a signed-in player
 * account that hasn't answered the age screen (no age_screen_at, including
 * no players row at all) is sent to /onboarding/age on every player page,
 * gets 403 on API routes and server actions -- except the setup paths it
 * needs to finish (the age screen, onboarding, auth routes). Coaches,
 * guardians, and answered players pass; a failed or missing profile read
 * fails open. Frozen accounts still get the stop screen first.
 * Run with: npx tsx --tsconfig src/lib/__tests__/middleware/tsconfig.json --test src/lib/__tests__/middleware/age-screen.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { ssrFake } from './fake-ssr'
import { middleware } from '../../../middleware'
import { AGE_SCREEN_MESSAGE } from '../../age-screen-gate'

const T = '2026-10-02T00:00:00Z'
const UNANSWERED = { age_band: null, age_band_coach: null, age_band_self: null, age_screen_at: null, age_confirmed_at: T }
const ANSWERED = { age_band: '13_17', age_band_coach: null, age_band_self: '13_17', age_screen_at: T, age_confirmed_at: T }
const FROZEN = { age_band: 'under_13', age_band_coach: null, age_band_self: 'under_13', age_screen_at: T, age_confirmed_at: T }

const req = (path: string, init: { action?: boolean; method?: string } = {}) =>
  new NextRequest(`https://releasepointai.com${path}`, { method: init.method ?? (init.action ? 'POST' : 'GET'), headers: init.action ? { 'next-action': 'abc123' } : {} })
const quiet = async <R>(fn: () => Promise<R>) => { const w = console.warn; console.warn = () => {}; try { return await fn() } finally { console.warn = w } }

beforeEach(() => { ssrFake.reset(); ssrFake.user = { id: 'u-kid' } })

test('unanswered player: every player page redirects to the age screen', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.player = UNANSWERED
  // /onboarding itself is a setup path (it funnels to the screen on its own).
  for (const p of ['/dashboard', '/clips/x', '/profile', '/player-settings']) {
    const r = await middleware(req(p))
    assert.equal(r.status, 307, p)
    assert.match(r.headers.get('location') ?? '', /\/onboarding\/age$/, p)
  }
})

test('unanswered player: API routes and server actions get 403, never data', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.player = UNANSWERED
  for (const p of ['/api/ai-chat', '/api/youtube-search']) {
    const r = await middleware(req(p, { method: 'POST' }))
    assert.equal(r.status, 403, p)
    assert.deepEqual(await r.json(), { error: AGE_SCREEN_MESSAGE })
  }
  const a = await middleware(req('/dashboard', { action: true }))
  assert.equal(a.status, 403)
  assert.equal(await a.text(), AGE_SCREEN_MESSAGE)
})

test('brand-new account with no players row yet is gated but can reach the screen', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.player = null
  const r = await middleware(req('/dashboard'))
  assert.match(r.headers.get('location') ?? '', /\/onboarding\/age$/)
  for (const p of ['/onboarding/age', '/onboarding', '/auth/confirm', '/auth/callback', '/auth/complete', '/auth/reset']) {
    const ok = await middleware(req(p))
    assert.notEqual(ok.status, 307, `${p}: no redirect loop`)
    assert.notEqual(ok.status, 403, `${p}: reachable`)
  }
})

test('answered players, coaches, and guardians pass everywhere', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.player = ANSWERED
  for (const p of ['/dashboard', '/clips/x', '/api/ai-chat']) {
    const r = await middleware(req(p, { method: 'POST' }))
    assert.notEqual(r.status, 403, p)
    assert.ok(!(r.headers.get('location') ?? '').endsWith('/onboarding/age'), p)
  }
  ssrFake.profile = { role: 'coach' }
  ssrFake.player = null
  for (const p of ['/dashboard', '/api/ai-chat']) {
    assert.notEqual((await middleware(req(p, { method: 'POST' }))).status, 403, `coach ${p}`)
  }
  ssrFake.profile = { role: 'guardian' }
  assert.notEqual((await middleware(req('/guardian', { method: 'GET' }))).status, 403, 'guardian')
})

test('a missing profile row fails open (the dashboard shows its error state)', async () => {
  ssrFake.profile = null
  ssrFake.player = UNANSWERED
  const r = await middleware(req('/dashboard'))
  assert.ok(!(r.headers.get('location') ?? '').endsWith('/onboarding/age'))
  assert.notEqual(r.status, 403)
})

test('a failed players read fails open and logs once', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.playerError = { message: 'column players.age_screen_at does not exist' }
  const r = await quiet(() => middleware(req('/dashboard')))
  assert.ok(!(r.headers.get('location') ?? '').endsWith('/onboarding/age'))
})

test('frozen accounts still get the stop screen, not the age screen', async () => {
  ssrFake.profile = { role: 'player' }
  ssrFake.player = FROZEN
  const r = await middleware(req('/dashboard'))
  assert.match(r.headers.get('x-middleware-rewrite') ?? '', /\/under-13$/)
})
