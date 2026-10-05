/**
 * recordConsent (compliance spec P1): parent consent can't be given in the
 * app yet, so the old one-click consent is refused with a clear error. It
 * writes nothing: no consent_given_at, no guardian link, no profile, no role
 * change, no RPC. (The admin-reviewed parent flow is parked for PR B.)
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/guardian-consent.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resetFake, state } from './fakes/db'
import { RedirectSignal } from './fakes/next-navigation'
import { recordConsent } from '../../../app/actions/guardian'

const USER = { id: 'u-guardian', email: 'parent@example.com' }
const tables = () => ({
  guardians: [{ id: 'g1', email: USER.email, full_name: 'Pat Parent', user_id: null }],
  players: [{ id: 'p1', guardian_id: 'g1', consent_given_at: null }],
  profiles: [{ id: USER.id, role: 'player', full_name: null }] as Record<string, unknown>[],
})

beforeEach(() => { resetFake({ tables: tables(), user: USER }) })

const quiet = async <R>(fn: () => Promise<R>) => {
  const w = console.warn; console.warn = () => {}
  try { return await fn() } finally { console.warn = w }
}

test('refused with the "coming soon" error; nothing is written and no role changes', async () => {
  const before = structuredClone(state.tables)
  const r = await quiet(() => recordConsent('p1'))
  assert.deepEqual(r, { error: "Parent permission can't be given in the app yet. It's coming soon." })
  assert.deepEqual(state.tables, before)
  assert.ok(!state.ops.some(o => o.action !== 'select'), JSON.stringify(state.ops))
})

test('signed out: sent to login, nothing written', async () => {
  state.user = null
  await assert.rejects(() => recordConsent('p1'), (e: unknown) => e instanceof RedirectSignal && e.url === '/auth/login')
  assert.equal(state.tables.players[0].consent_given_at, null)
})

test('the consent page no longer offers a consent button', () => {
  const src = readFileSync(new URL('../../../app/guardian/consent/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /recordConsent|ConsentForm/)
  assert.match(src, /PARENT_CONSENT_COMING_SOON|coming soon/i)
})
