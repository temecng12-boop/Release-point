/**
 * Signup password rule: at least 8 characters and not a common password
 * (case-insensitive). The signup form shows the message inline and the
 * signUp server action checks again.
 * Run with: npx tsx --test src/lib/__tests__/password-rule.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { passwordProblem, PASSWORD_MIN_LENGTH } from '../password-rule'
import { COMMON_PASSWORDS } from '../common-passwords'

test('7 characters is rejected, 8 is allowed', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8)
  assert.match(passwordProblem('Tq9#vLm')!, /at least 8 characters/)
  assert.equal(passwordProblem('Tq9#vLm2'), null)
  assert.match(passwordProblem('')!, /at least 8/)
  assert.match(passwordProblem(null)!, /at least 8/)
})

test('common passwords are rejected in any letter case', () => {
  for (const pw of ['password', 'PASSWORD', 'Password', 'pAsSwOrD', '12345678', 'Baseball', 'iloveyou', 'Password1']) {
    assert.match(passwordProblem(pw) ?? '', /too common/, pw)
  }
})

test('the list is about 1,000 lowercase entries of 8+ characters, no duplicates', () => {
  assert.equal(COMMON_PASSWORDS.length, 999, "SecLists' top 1,000 (8+ chars) minus 'thirteen'")
  assert.equal(new Set(COMMON_PASSWORDS).size, 999)
  assert.ok(!COMMON_PASSWORDS.some((pw) => /thirteen|\b13\b/i.test(pw)), 'nothing that names the age cutoff (the list ships to the browser)')
  for (const pw of COMMON_PASSWORDS) {
    assert.ok(pw.length >= 8, pw)
    assert.equal(pw, pw.toLowerCase())
  }
})

test('signup form: inline, accessible message and a check before submit', () => {
  const page = readFileSync(new URL('../../app/auth/signup/signup-form.tsx', import.meta.url), 'utf8')
  assert.match(page, /passwordProblem\(password\)/)
  assert.match(page, /aria-describedby="coach-password-rule"/)
  assert.match(page, /aria-invalid=\{showPwProblem\}/)
  assert.match(page, /id="coach-password-rule" aria-live="polite"/)
  assert.match(page, /htmlFor="coach-password"/)
  assert.match(page, /if \(pwProblem\) \{ e\.preventDefault\(\)/)
})
