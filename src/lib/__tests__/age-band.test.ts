/**
 * Age bands (migration 037): the birth month/year screen, the younger-band
 * rule, under-13 age groups, and which players see which prompt.
 * Run with: npx tsx --test src/lib/__tests__/age-band.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ageGroupIsUnder13, bandFromBirth, effectiveAgeBand, youngerBand, BIRTH_INVALID } from '../age-band'
import { canSelfConfirmAdult023, canSelfConfirmAgeBand, isConsentPendingError, needsAgeScreen, pendingReason, uploadBlockedCopy, uploadBlockedText } from '../consent'
import { UNDER_13_MODE, parentConsentFlowEnabled, UNDER_13_STOP_MESSAGE } from '../under13-mode'

const T = '2026-10-01T00:00:00.000Z'
const NOW = new Date(2026, 9, 3) // Oct 3, 2026 (local)

test('bandFromBirth: month precision, a birthday this month counts as not reached (younger)', () => {
  const band = (m: number, y: number) => { const r = bandFromBirth(String(m), String(y), NOW); return r.ok ? r.band : r.error }
  assert.equal(band(9, 2013), '13_17', 'turned 13 last month')
  assert.equal(band(10, 2013), 'under_13', 'turns 13 this month: still under 13')
  assert.equal(band(11, 2013), 'under_13')
  assert.equal(band(1, 2014), 'under_13')
  assert.equal(band(9, 2008), '18_plus', 'turned 18 last month')
  assert.equal(band(10, 2008), '13_17', 'turns 18 this month: still 13 to 17')
  assert.equal(band(1, 1980), '18_plus')
  for (const [m, y] of [['', '2010'], ['13', '2010'], ['0', '2010'], ['5', ''], ['5', '20x0'], ['5', '1800'], ['5', '2027'], ['11', '2026']]) {
    const r = bandFromBirth(m, y, NOW)
    assert.equal(r.ok, false, `${m}/${y} rejected`)
    assert.equal(!r.ok && r.error, BIRTH_INVALID)
  }
  assert.equal(bandFromBirth(null, null, NOW).ok, false)
})

test('youngerBand / effectiveAgeBand: the younger answer wins, an under-13 age group counts as under 13', () => {
  assert.equal(youngerBand('18_plus', '13_17'), '13_17')
  assert.equal(youngerBand(null, '18_plus', undefined), '18_plus')
  assert.equal(youngerBand('under_13', '18_plus'), 'under_13')
  assert.equal(youngerBand(null, 'bogus'), null)
  assert.deepEqual(effectiveAgeBand({ coach: '13_17', self: '18_plus' }), { band: '13_17', source: 'coach' }, 'teen says 18+, coach said 13-17: keep 13-17')
  assert.deepEqual(effectiveAgeBand({ coach: '18_plus', self: '13_17' }), { band: '13_17', source: 'self' })
  assert.deepEqual(effectiveAgeBand({ coach: '18_plus', self: '18_plus' }), { band: '18_plus', source: 'coach' }, 'a tie keeps the coach as the source (same as 037)')
  assert.deepEqual(effectiveAgeBand({ coach: '18_plus' }), { band: '18_plus', source: 'coach' })
  assert.deepEqual(effectiveAgeBand({ coach: '18_plus', ageGroups: ['Youth 10-12'] }), { band: 'under_13', source: 'age_group' })
  assert.deepEqual(effectiveAgeBand({ ageGroups: ['High School', null] }), { band: null, source: null })
  assert.deepEqual(effectiveAgeBand({ self: 'under_13', ageGroups: ['12U'] }), { band: 'under_13', source: 'self' })
})

test('ageGroupIsUnder13 (same cases as the SQL function in the PGlite test)', () => {
  for (const g of ['Youth 10-12', 'youth 10–12', '8 to 10', '12U', 'U12', 'u-10', 'Under 12', '9-12 Rec']) assert.equal(ageGroupIsUnder13(g), true, g)
  for (const g of ['Youth', '13U', '14-16', 'High School', 'Middle School', 'U14', '18U', '', null, undefined, 'Amateur', 'Professional']) assert.equal(ageGroupIsUnder13(g), false, String(g))
})

test('the under-13 switch is the hard stop in this build', () => {
  assert.equal(UNDER_13_MODE, 'hard_stop')
  assert.equal(parentConsentFlowEnabled(), false)
  assert.equal(parentConsentFlowEnabled('parent_consent'), true)
  assert.equal(UNDER_13_STOP_MESSAGE, "We need a parent's permission first. Ask your coach.")
})

test('canSelfConfirmAgeBand: once, only for a coachless player with no answer and no guardian, after 037', () => {
  const base = { coach_id: null, guardian_id: null, age_band: null, age_band_self: null, age_screen_at: null }
  assert.equal(canSelfConfirmAgeBand(base), true)
  assert.equal(canSelfConfirmAgeBand({ ...base, coach_id: 'c1' }), false, 'the coach records age; the age screen asks instead')
  assert.equal(canSelfConfirmAgeBand({ ...base, guardian_id: 'g1' }), false, 'guardian on file')
  assert.equal(canSelfConfirmAgeBand({ ...base, age_band: '18_plus', age_confirmed_at: T }), false, 'band on file (e.g. backfilled 18+)')
  assert.equal(canSelfConfirmAgeBand({ ...base, age_band: 'under_13', age_band_self: 'under_13', age_confirmed_at: T, age_screen_at: T }), false, 'under 13 can\'t switch to an older band')
  assert.equal(canSelfConfirmAgeBand({ ...base, age_band_pending_migration: true }), false, 'before 037: canSelfConfirmAdult023')
  assert.equal(canSelfConfirmAgeBand(null), false)
  assert.equal(canSelfConfirmAdult023({ coach_id: null, guardian_id: null, adult_confirmed_at: null, consent_given_at: null, age_band_pending_migration: true }), true)
  assert.equal(canSelfConfirmAdult023({ coach_id: null, adult_confirmed_at: T, age_band_pending_migration: true }), false)
  assert.equal(canSelfConfirmAdult023({ coach_id: null, consent_rules_pending_migration: true, age_band_pending_migration: true }), false, 'before 023 nothing is blocked')
})

test('needsAgeScreen: coach-invited players who have not answered, not under 13, after 037', () => {
  const invited = { coach_id: 'c1', user_id: 'u1', age_screen_at: null, age_band: '18_plus', age_confirmed_at: T }
  assert.equal(needsAgeScreen(invited), true, 'even with the coach\'s 18+ on file')
  assert.equal(needsAgeScreen({ ...invited, age_screen_at: T }), false, 'answered')
  assert.equal(needsAgeScreen({ ...invited, coach_id: null }), false, 'coachless: the dashboard banner asks instead')
  assert.equal(needsAgeScreen({ ...invited, age_band: 'under_13', age_band_coach: 'under_13' }), false, 'under 13 (coach): the stop message instead')
  assert.equal(needsAgeScreen({ ...invited, age_band: 'under_13' }), true, 'under 13 from an age group only: answers first')
  assert.equal(needsAgeScreen({ ...invited, age_band_pending_migration: true }), false, 'before 037')
  assert.equal(needsAgeScreen(null), false)
})

test('pendingReason and blocked copy', () => {
  assert.equal(pendingReason({ age_band: 'under_13', age_confirmed_at: T }), 'under_13')
  assert.equal(pendingReason({ age_band: null }), 'age_band')
  assert.equal(pendingReason({ age_band: '13_17', age_confirmed_at: T }), null)
  assert.match(uploadBlockedCopy('player', { selfConfirm: true, confirmShownBelow: true }).nextStep, /^Confirm your age below\.$/)
  assert.match(uploadBlockedText('player', { selfConfirm: true }), /Confirm your age at the top of your dashboard\.$/)
  assert.match(uploadBlockedText('player'), /Ask your coach to confirm your age\.$/)
  assert.match(uploadBlockedText('coach', { reason: 'under_13' }), /^This player is under 13, so video can't be added\. Parent consent for players under 13 is coming soon\./)
  for (const v of ['coach', 'player'] as const) for (const reason of ['age_band', 'under_13'] as const) {
    assert.doesNotMatch(uploadBlockedText(v, { reason }), /guardian|email/i, `${v}/${reason}: no guardian-email wording`)
  }
})

test('isConsentPendingError: 023\'s and 037\'s trigger errors only', () => {
  assert.equal(isConsentPendingError({ code: '42501', message: 'guardian consent for this player is still pending' }), true)
  assert.equal(isConsentPendingError({ code: '42501', message: 'video consent for this player is still pending' }), true)
  assert.equal(isConsentPendingError({ code: '42501', message: 'permission denied for table clips' }), false)
  assert.equal(isConsentPendingError({ code: '23503', message: 'consent pending' }), false)
  assert.equal(isConsentPendingError(null), false)
})

test('needsFirstAgeScreen: invited players, and new coachless accounts (OAuth) before onboarding', async () => {
  const { needsFirstAgeScreen } = await import('../consent')
  const base = { coach_id: null, guardian_id: null, age_band: null, age_band_self: null, age_screen_at: null, age_confirmed_at: null, adult_confirmed_at: null, consent_given_at: null }
  assert.equal(needsFirstAgeScreen({ ...base, position: null }), true, 'new coachless account')
  assert.equal(needsFirstAgeScreen({ ...base, position: 'pitcher' }), false, 'onboarded coachless: banner instead')
  assert.equal(needsFirstAgeScreen({ ...base, position: null, age_band: '18_plus', age_band_self: '18_plus', age_screen_at: T, age_confirmed_at: T }), false)
  assert.equal(needsFirstAgeScreen({ ...base, coach_id: 'c', position: 'pitcher' }), true, 'invited, not answered')
  assert.equal(needsFirstAgeScreen({ ...base, coach_id: 'c', age_screen_at: T }), false)
  assert.equal(needsFirstAgeScreen(null), false)
})

test('plain "Youth" counts as under 13 only when no band is known; ranges still win', async () => {
  const { ageGroupIsPlainYouth } = await import('../age-band')
  for (const g of ['Youth', 'youth', ' Youth ', 'Youth League']) assert.equal(ageGroupIsPlainYouth(g), true, g)
  for (const g of ['Youth 13-14', 'Youth 10-12', '12U', 'Middle School', 'High School', 'Youthful', '', null]) assert.equal(ageGroupIsPlainYouth(g), false, String(g))
  assert.deepEqual(effectiveAgeBand({ ageGroups: ['Youth'] }), { band: 'under_13', source: 'age_group' })
  assert.deepEqual(effectiveAgeBand({ coach: '13_17', ageGroups: ['Youth'] }), { band: '13_17', source: 'coach' }, 'a known band says otherwise')
  assert.deepEqual(effectiveAgeBand({ self: '18_plus', ageGroups: ['Youth'] }), { band: '18_plus', source: 'self' })
  assert.deepEqual(effectiveAgeBand({ coach: '18_plus', ageGroups: ['Youth 10-12'] }), { band: 'under_13', source: 'age_group' }, 'an under-13 range always wins')
  assert.deepEqual(effectiveAgeBand({ ageGroups: ['Youth 13-14'] }), { band: null, source: null }, 'an older range says otherwise')
})

test('frozen vs. under 13 from an age group only', async () => {
  const { isFrozenUnder13, under13FromAgeGroupOnly } = await import('../consent')
  const base = { age_band: 'under_13', age_confirmed_at: T, age_band_coach: null, age_band_self: null }
  assert.equal(under13FromAgeGroupOnly(base), true)
  assert.equal(isFrozenUnder13(base), false, 'no answer yet: the age screen first')
  assert.equal(isFrozenUnder13({ ...base, age_band_self: 'under_13' }), true)
  assert.equal(isFrozenUnder13({ ...base, age_band_coach: 'under_13' }), true)
  assert.equal(isFrozenUnder13({ ...base, age_band_self: '13_17' }), true, 'answered 13-17 on a 10-12 team: still under 13, frozen')
  assert.equal(isFrozenUnder13({ ...base, age_band: '13_17' }), false)
  assert.equal(isFrozenUnder13(null), false)
  assert.equal(canSelfConfirmAgeBand({ ...base, coach_id: null, guardian_id: null }), true, 'coachless, Youth only: may still answer')
})
