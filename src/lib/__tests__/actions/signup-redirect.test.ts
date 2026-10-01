/**
 * Player signup links: emailRedirectTo uses NEXT_PUBLIC_SITE_URL, and falls
 * back to the production site (never localhost) when it is unset or empty.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/signup-redirect.test.ts
 */
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake } from './fakes/db'
import { otpCalls } from './fakes/supabase-server'
import { signUpPlayer } from '../../../app/actions/auth'

const saved = process.env.NEXT_PUBLIC_SITE_URL
const form = () => { const fd = new FormData(); fd.set('email', 'p@example.com'); fd.set('full_name', 'Pat'); fd.set('adult_confirmed', 'yes'); return fd }

beforeEach(() => { resetFake(); otpCalls.length = 0 })
after(() => { if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved })

test('unset or empty NEXT_PUBLIC_SITE_URL -> production site, not localhost', async () => {
  for (const v of [undefined, '']) {
    if (v === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = v
    otpCalls.length = 0
    assert.deepEqual(await signUpPlayer(undefined, form()), { sent: true, email: 'p@example.com' })
    assert.equal(otpCalls[0].options?.emailRedirectTo, 'https://releasepointai.com/auth/confirm')
  }
})

test('NEXT_PUBLIC_SITE_URL set (local dev) -> used as is', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  await signUpPlayer(undefined, form())
  assert.equal(otpCalls[0].options?.emailRedirectTo, 'http://localhost:3000/auth/confirm')
})
