// The login page's "Email Link" sign-in (signInWithOtp). Kept here so the
// error handling can be tested without a browser.
import { isFetchFailure, isRateLimited, NETWORK_ERROR, type AuthErrorLike } from '@/lib/password-reset'

/** Shown after a link is requested. Supabase answers the same for known and new emails. */
export const EMAIL_LINK_SENT_MESSAGE = 'Check your email for a sign-in link.'

export type EmailLinkAuth = {
  signInWithOtp(credentials: { email: string; options: { emailRedirectTo: string } }): Promise<{ error: AuthErrorLike }>
}
export type EmailLinkResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Ask Supabase for a sign-in link. A rate limit (429) gets the same message
 * as any other request, so it can't reveal which emails have accounts.
 * Network and other errors are returned, never shown as sent.
 */
export async function requestEmailLink(auth: EmailLinkAuth, email: string, emailRedirectTo: string): Promise<EmailLinkResult> {
  let error: AuthErrorLike
  try {
    ({ error } = await auth.signInWithOtp({ email, options: { emailRedirectTo } }))
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  if (error) {
    if (isFetchFailure(error)) return { ok: false, error: NETWORK_ERROR }
    if (isRateLimited(error)) return { ok: true, message: EMAIL_LINK_SENT_MESSAGE }
    return { ok: false, error: error.message }
  }
  return { ok: true, message: EMAIL_LINK_SENT_MESSAGE }
}
