// Signup password rule, checked in the browser (inline message) and again in
// the signUp server action, which never trusts the browser's check.
import { COMMON_PASSWORDS } from './common-passwords'

export const PASSWORD_MIN_LENGTH = 8

const COMMON = new Set(COMMON_PASSWORDS)

/** null if the password is allowed, otherwise the message to show. */
export function passwordProblem(password: string | null | undefined): string | null {
  const pw = password ?? ''
  if (Array.from(pw).length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (COMMON.has(pw.toLowerCase())) return 'This password is too common. Choose one that is harder to guess.'
  return null
}
