/**
 * The one-time 18+ prompt (RP-041) for players without a coach, and the
 * friendly upload-blocked copy.
 * Run with: npx tsx --test src/lib/__tests__/self-confirm-adult.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canSelfConfirmAdult, isConsentPendingError, uploadBlockedCopy, uploadBlockedText } from '../consent'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const T = '2026-10-01T00:00:00.000Z'

test('canSelfConfirmAdult: only a pending player with no coach', () => {
  assert.equal(canSelfConfirmAdult({ coach_id: null, adult_confirmed_at: null, consent_given_at: null }), true)
  assert.equal(canSelfConfirmAdult({ coach_id: 'c1', adult_confirmed_at: null, consent_given_at: null }), false, 'the coach records age')
  assert.equal(canSelfConfirmAdult({ coach_id: null, adult_confirmed_at: T }), false, 'already confirmed: shown once only')
  assert.equal(canSelfConfirmAdult({ coach_id: null, consent_given_at: T }), false, 'guardian consent on file')
  assert.equal(canSelfConfirmAdult({ coach_id: null, consent_rules_pending_migration: true }), false, 'before 023 nothing is blocked')
  assert.equal(canSelfConfirmAdult(null), false)
})

test('isConsentPendingError: only 023\'s trigger error', () => {
  assert.equal(isConsentPendingError({ code: '42501', message: 'guardian consent for this player is still pending' }), true)
  assert.equal(isConsentPendingError({ code: '42501', message: 'permission denied for table clips' }), false)
  assert.equal(isConsentPendingError({ code: '23503', message: 'consent pending' }), false)
  assert.equal(isConsentPendingError(null), false)
})

test('blocked copy says what to do next', () => {
  const coached = uploadBlockedCopy('player')
  assert.match(coached.nextStep, /^If you are 18 or older, ask your coach to mark you as 18\+\. If you are under 18, a parent or guardian has to give consent first\.$/)
  assert.match(uploadBlockedCopy('player', { selfConfirm: true, confirmShownBelow: true }).nextStep, /^If you are 18 or older, confirm it below\./)
  assert.match(uploadBlockedText('player', { selfConfirm: true }), /confirm it on your dashboard\./)
  assert.match(uploadBlockedText('coach'), /^Guardian consent for this player is still pending, so video can't be added yet\. If the player is 18 or older, mark them as 18\+/)
})

test('dashboard shows the 18+ prompt in the blocked notice only for players who can self-confirm', () => {
  const page = read('app/dashboard/page.tsx')
  assert.match(page, /'id, full_name, position, coach_id'/)
  assert.match(page, /selfConfirm=\{canSelfConfirmAdult\(playerRow\)\}/)
  assert.match(page, /blockedAction=\{canSelfConfirmAdult\(playerRow\) \? <ConfirmAdultButton \/> : undefined\}/)
  const btn = read('app/dashboard/confirm-adult-button.tsx')
  assert.match(btn, /confirmMyAdultStatus\(\)/)
  assert.match(btn, /if \(result\?\.error\) \{ setError\(result\.error\); return \}/)
  assert.match(btn, /role="alert"/)
  assert.match(read('components/upload-blocked-notice.tsx'), /uploadBlockedCopy\(viewer, \{ selfConfirm, confirmShownBelow: selfConfirm && !!action \}\)/)
})
