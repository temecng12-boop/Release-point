/**
 * The frozen under-13 gate, through the real middleware: a frozen account
 * gets the stop screen on every player page (clips, lessons, metrics,
 * profile, dashboard, uploads), 403 on every API route (AI Coach, signed-URL
 * debug route) and on every server action; open pages and sign-out still work.
 * Run with: npx tsx --tsconfig src/lib/__tests__/middleware/tsconfig.json --test src/lib/__tests__/middleware/*.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { ssrFake } from './fake-ssr'
import { middleware } from '../../../middleware'
import { frozenGateKind } from '../../under13-gate'

const T = '2026-10-02T00:00:00Z'
const FROZEN_SELF = { age_band: 'under_13', age_band_self: 'under_13', age_band_coach: '13_17', age_confirmed_at: T }
const FROZEN_COACH = { age_band: 'under_13', age_band_self: null, age_band_coach: 'under_13', age_confirmed_at: T }
const GROUP_ONLY = { age_band: 'under_13', age_band_self: null, age_band_coach: null, age_confirmed_at: T }
const TEEN = { age_band: '13_17', age_band_self: '13_17', age_band_coach: null, age_confirmed_at: T }

const req = (path: string, init: { action?: boolean; method?: string } = {}) =>
  new NextRequest(`https://releasepointai.com${path}`, { method: init.method ?? (init.action ? 'POST' : 'GET'), headers: init.action ? { 'next-action': 'abc123' } : {} })
const rewrite = (r: Response) => r.headers.get('x-middleware-rewrite')
const quiet = async <R>(fn: () => Promise<R>) => { const w = console.warn; console.warn = () => {}; try { return await fn() } finally { console.warn = w } }

const PLAYER_PAGES = ['/dashboard', '/clips/11111111-1111-4111-8111-111111111111', '/clips/compare', '/profile', '/profile/p1', '/player-settings', '/onboarding', '/onboarding/age', '/guardian', '/dashboard/team/t1']
const API = ['/api/ai-chat', '/api/youtube-search']

beforeEach(() => { ssrFake.reset(); ssrFake.user = { id: 'u-kid' } })

for (const [label, row] of [['own answer', FROZEN_SELF], ['coach answer', FROZEN_COACH]] as const) {
  test(`frozen (${label}): every player page shows the stop screen (rewrite, URL kept)`, async () => {
    ssrFake.player = row
    for (const p of PLAYER_PAGES) {
      const r = await middleware(req(p))
      assert.match(rewrite(r) ?? '', /\/under-13$/, p)
      assert.equal(r.headers.get('cache-control'), 'private, no-store', p)
    }
  })

  test(`frozen (${label}): API routes and server actions get 403 with the stop message`, async () => {
    ssrFake.player = row
    for (const p of API) {
      const r = await middleware(req(p, { method: 'POST' }))
      assert.equal(r.status, 403, p)
      assert.deepEqual(await r.json(), { error: "We need a parent's permission first. Ask your coach." })
    }
    for (const p of ['/dashboard', '/clips/x', '/under-13', '/']) {
      const r = await middleware(req(p, { action: true }))
      assert.equal(r.status, 403, `action on ${p}`)
      assert.equal(await r.text(), "We need a parent's permission first. Ask your coach.")
    }
  })
}

test('frozen: the stop screen, sign-out route and public pages stay open', async () => {
  ssrFake.player = FROZEN_SELF
  for (const p of ['/under-13', '/auth/signout', '/', '/terms', '/privacy', '/about', '/waitlist']) {
    const r = await middleware(req(p, { method: p === '/auth/signout' ? 'POST' : 'GET' }))
    assert.equal(rewrite(r), null, p)
    assert.equal(r.status, 200, p)
  }
})

test('not frozen: 13 to 17 player, coach (no player row), under 13 from an age group with no answer yet', async () => {
  for (const row of [TEEN, null, GROUP_ONLY]) {
    ssrFake.player = row
    for (const p of [...PLAYER_PAGES, ...API]) {
      const r = await middleware(req(p))
      assert.equal(rewrite(r), null, `${JSON.stringify(row)} ${p}`)
      assert.notEqual(r.status, 403)
    }
    assert.notEqual((await middleware(req('/dashboard', { action: true }))).status, 403)
  }
})

test('signed out: no player read; the login redirect is unchanged', async () => {
  ssrFake.user = null
  const r = await middleware(req('/clips/x'))
  assert.equal(r.status, 307)
  assert.match(r.headers.get('location') ?? '', /\/auth\/login$/)
  assert.equal(ssrFake.reads, 0)
})

test('open pages don\'t read the player row (no extra query)', async () => {
  ssrFake.player = FROZEN_SELF
  await middleware(req('/terms'))
  assert.equal(ssrFake.reads, 0)
})

test('a read error does not block (video stays blocked by the database)', async () => {
  ssrFake.playerError = { message: 'column players.age_band does not exist' }
  const r = await quiet(() => middleware(req('/clips/x')))
  assert.equal(rewrite(r), null)
})

test('frozenGateKind', () => {
  assert.equal(frozenGateKind('/api/ai-chat', false), 'api')
  assert.equal(frozenGateKind('/terms', true), 'action', 'server actions are refused on every path (ids are global)')
  assert.equal(frozenGateKind('/terms/x', false), 'open')
  assert.equal(frozenGateKind('/termsx', false), 'page')
  assert.equal(frozenGateKind('/auth/login', false), 'page')
})
