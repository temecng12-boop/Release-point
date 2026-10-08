/**
 * PLAYWRIGHT_CLIP_FIXTURE=1 lets the real clip/compare fixture URLs through
 * without a login redirect. Off by default.
 * Run with: npx tsx --tsconfig src/lib/__tests__/middleware/tsconfig.json --test src/lib/__tests__/middleware/e2e-clip-fixture.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { ssrFake } from './fake-ssr'
import { middleware } from '../../../middleware'
import { E2E_CLIP_A, E2E_CLIP_B } from '../../e2e-clip-fixture'

const req = (path: string) => new NextRequest(`https://releasepointai.com${path}`)

let prev: string | undefined
let prevVercel: string | undefined
beforeEach(() => {
  ssrFake.reset()
  prev = process.env.PLAYWRIGHT_CLIP_FIXTURE
  prevVercel = process.env.VERCEL
  delete process.env.PLAYWRIGHT_CLIP_FIXTURE
  delete process.env.VERCEL
})
afterEach(() => {
  if (prev === undefined) delete process.env.PLAYWRIGHT_CLIP_FIXTURE
  else process.env.PLAYWRIGHT_CLIP_FIXTURE = prev
  if (prevVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = prevVercel
})

test('signed out: fixture clip still redirects to login when the env is off', async () => {
  const r = await middleware(req(`/clips/${E2E_CLIP_A}`))
  assert.equal(r.status, 307)
  assert.match(r.headers.get('location') ?? '', /\/auth\/login$/)
})

test('signed out: fixture clip and compare pass when PLAYWRIGHT_CLIP_FIXTURE=1', async () => {
  process.env.PLAYWRIGHT_CLIP_FIXTURE = '1'
  const clip = await middleware(req(`/clips/${E2E_CLIP_A}`))
  assert.notEqual(clip.status, 307)
  const compare = await middleware(req(`/clips/compare?a=${E2E_CLIP_A}&b=${E2E_CLIP_B}`))
  assert.notEqual(compare.status, 307)
  const other = await middleware(req('/clips/not-a-fixture'))
  assert.equal(other.status, 307)
  assert.equal(ssrFake.reads, 0)
})

test('signed out: fixture stays closed on Vercel even if PLAYWRIGHT_CLIP_FIXTURE=1', async () => {
  process.env.PLAYWRIGHT_CLIP_FIXTURE = '1'
  process.env.VERCEL = '1'
  const r = await middleware(req(`/clips/${E2E_CLIP_A}`))
  assert.equal(r.status, 307)
  assert.match(r.headers.get('location') ?? '', /\/auth\/login$/)
})
