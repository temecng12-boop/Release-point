/**
 * Age bands in the UI (037): coach banners (no-band players first, then
 * under 13), the dashboard / onboarding gates, the two-step signup, and the
 * 44px tap targets on the new controls.
 * Run with: npx tsx --test src/lib/__tests__/age-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pendingFromRows, pendingBannerLines } from '../pending-players'

const T = '2026-10-01T00:00:00.000Z'
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const row = (id: string, name: string, f: Record<string, unknown>) => ({ id, full_name: name, coach_id: 'c', adult_confirmed_at: null, consent_given_at: null, age_band: null, age_confirmed_at: null, ...f })

test('pending players: no band first, then under 13; confirmed 13-17 / 18+ and other coaches\' players are left out', () => {
  const rows = [
    row('1', 'Zed', { age_band: 'under_13', age_confirmed_at: T }),
    row('2', 'Amy', { age_band: 'under_13', age_confirmed_at: T }),
    row('3', 'Bob', {}),
    row('4', 'Cal', { age_band: '13_17', age_confirmed_at: T }),
    row('5', 'Dee', { age_band: '18_plus', age_confirmed_at: T }),
    { ...row('6', 'Eve', {}), coach_id: 'other' },
    row('7', 'Ann', { consent_given_at: T }),
  ]
  const p = pendingFromRows(rows as never, 'c')
  assert.deepEqual(p.map((x) => [x.full_name, x.reason]), [['Ann', 'age_band'], ['Bob', 'age_band'], ['Amy', 'under_13'], ['Zed', 'under_13']])
  assert.deepEqual(pendingBannerLines(p), [
    '2 players need their age confirmed before video can be added.',
    "2 players are under 13, so video can't be added. Parent consent for players under 13 is coming soon.",
  ])
  assert.deepEqual(pendingBannerLines(p.slice(0, 1)), ['1 player needs their age confirmed before video can be added.'])
  assert.deepEqual(pendingBannerLines([]), [])
})

test('dashboard: the age screen comes first for invited players; under 13 sees only the stop message', () => {
  const s = src('app/dashboard/page.tsx')
  assert.match(s, /needsFirstAgeScreen\(playerRow\)\) redirect\('\/onboarding\/age'\)/)
  assert.match(s, /frozen && <Under13Stop \/>/)
  assert.ok(s.indexOf("redirect('/onboarding/age')") < s.indexOf("redirect('/onboarding')"), 'age screen before the position picker')
  const o = src('app/onboarding/page.tsx')
  assert.match(o, /needsFirstAgeScreen\(playerRow\)\) redirect\('\/onboarding\/age'\)/)
})

test('signup: birth month/year is step 1, the stop message replaces the form, no guardian fields', () => {
  const s = src('app/auth/signup/page.tsx').split('function PlayerForm')[1].split('function RoleSelect')[0]
  assert.match(s, /useActionState\(checkSignupAge/)
  assert.match(s, /<Under13Stop \/>/)
  assert.ok(s.indexOf('<BirthFields') < s.indexOf('name="email"'), 'birth fields before email')
  assert.doesNotMatch(s, /guardian_email|adult_confirmed/)
})

test('under-13 stop copy, and the new controls are 44px tall', () => {
  assert.match(src('components/under13-stop.tsx'), /UNDER_13_STOP_MESSAGE/)
  for (const f of ['components/birth-fields.tsx', 'app/dashboard/age-screen-form.tsx', 'app/dashboard/age-band-confirm.tsx', 'app/dashboard/age-band-fields.tsx']) {
    assert.match(src(f), /min-h-\[44px\]|min-h-11|h-11/, f)
  }
})
