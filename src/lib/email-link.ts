// The login page's "Email Link" sign-in (signInWithOtp). Kept here so the
// error handling can be tested without a browser.
//
// Signup is invite-only, so this must never create an account:
// shouldCreateUser:false, and an unknown email gets an honest "no account"
// error, never a fake success.
import { isFetchFailure, isRateLimited, NETWORK_ERROR, type AuthErrorLike } from '@/lib/password-reset'

/** Shown after a link is requested. Supabase answers the same for known and new emails. */
export const EMAIL_LINK_SENT_MESSAGE = 'Check your email for a sign-in link.'

/** Shown when this email has no account yet (never a fake "check your email"). */
export const EMAIL_LINK_NO_ACCOUNT_MESSAGE =
  "We couldn't find an account for that email. If you were invited, ask your coach to resend the invite — or join the waitlist."

export const EMAIL_LINK_RATE_LIMIT_MESSAGE =
  "You've requested a few links in a short span. Please wait a minute and try again."

export type EmailLinkAuth = {
  signInWithOtp(credentials: { email: string; options: { emailRedirectTo: string; shouldCreateUser: boolean } }): Promise<{ error: AuthErrorLike }>
}
export type EmailLinkResult = { ok: true; message: string } | { ok: false; error: string }

function isNoAccount(error: AuthErrorLike): boolean {
  if (!error) return false
  if (typeof error.code === 'string' && error.code.toLowerCase() === 'user_not_found') return true
  return /user not found/i.test(error.message ?? '')
}

/**
 * Ask Supabase for a sign-in link for an EXISTING account (never creates
 * one). Every failure is returned honestly: a missing account, a rate
 * limit, and network errors are all shown, never as "sent".
 */
export async function requestEmailLink(auth: EmailLinkAuth, email: string, emailRedirectTo: string): Promise<EmailLinkResult> {
  let error: AuthErrorLike
  try {
    ({ error } = await auth.signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser: false } }))
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  if (error) {
    if (isFetchFailure(error)) return { ok: false, error: NETWORK_ERROR }
    if (isNoAccount(error)) return { ok: false, error: EMAIL_LINK_NO_ACCOUNT_MESSAGE }
    if (isRateLimited(error)) return { ok: false, error: EMAIL_LINK_RATE_LIMIT_MESSAGE }
    return { ok: false, error: error.message }
  }
  return { ok: true, message: EMAIL_LINK_SENT_MESSAGE }
}
