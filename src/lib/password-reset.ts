// Password reset (coach accounts). Pure helpers shared by the login page's
// "Forgot password?" form, the /auth/reset page and its server action.
//
// Flow: PKCE, the same path the app's email links already use. The browser
// client's resetPasswordForEmail stores the PKCE code verifier in a cookie;
// the email link goes through Supabase to /auth/confirm?code=...&next=/auth/reset,
// which hands the code to /auth/callback; the callback exchanges it for a
// session (server-side, cookies) and redirects to /auth/reset.

export const RESET_PATH = '/auth/reset'

/** Shown whether or not the email has an account, so the form doesn't reveal which emails exist. */
export const RESET_SENT_MESSAGE = 'If an account exists for that email, a reset link is on its way.'
export const RESET_SENT_HINT = 'Open the link on this device, in this browser. It expires in one hour.'

export const RESET_LINK_INVALID =
  'This reset link has expired or was already used, or it was opened in a different browser. Request a new one.'
export const RESET_NO_SESSION =
  'This page only works from a password reset link. Request a new one.'

/** Used when NEXT_PUBLIC_SITE_URL is unset, the same fallback as invite emails (invite.ts, email.ts). */
export const PRODUCTION_SITE_URL = 'https://releasepointai.com'

/**
 * The redirectTo sent with the reset email. Fixed: built only from the site
 * URL (NEXT_PUBLIC_SITE_URL, else production), never from user input or the
 * current page. Only the site URL's origin is used. Local dev sets
 * NEXT_PUBLIC_SITE_URL=http://localhost:3000.
 */
export function passwordResetRedirectUrl(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const origin = new URL(siteUrl || PRODUCTION_SITE_URL).origin
  return `${origin}/auth/confirm?next=${encodeURIComponent(RESET_PATH)}`
}

export const NETWORK_ERROR = 'Couldn\'t reach the server. Check your connection and try again.'

export type AuthErrorLike = { message: string; status?: number; code?: string; name?: string } | null
export type ResetRequestAuth = {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: AuthErrorLike }>
}
export type ResetRequestResult = { ok: true; message: string } | { ok: false; error: string }

/** supabase-js returns (not throws) a fetch failure as status 0 / AuthRetryableFetchError. */
export function isFetchFailure(error: NonNullable<AuthErrorLike>): boolean {
  return error.status === 0 || error.name === 'AuthRetryableFetchError'
}

/**
 * Supabase rate limits (HTTP 429). Some are per email address (a link was
 * requested for it recently), so saying "too many requests" would tell
 * someone that the address has an account. Callers show their neutral
 * "sent" message instead.
 */
export function isRateLimited(error: NonNullable<AuthErrorLike>): boolean {
  return error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit'
}

/**
 * Ask Supabase to send the reset email. A rate limit (429) gets the same
 * neutral message as an unknown email. Other errors (network, invalid
 * email, Supabase failing to send) are returned, never hidden.
 */
export async function requestPasswordReset(auth: ResetRequestAuth, email: string): Promise<ResetRequestResult> {
  const address = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: 'Enter the email address you sign in with.' }
  let error: AuthErrorLike
  try {
    ({ error } = await auth.resetPasswordForEmail(address, { redirectTo: passwordResetRedirectUrl() }))
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  if (error) {
    if (isFetchFailure(error)) return { ok: false, error: NETWORK_ERROR }
    if (isRateLimited(error)) return { ok: true, message: RESET_SENT_MESSAGE }
    return { ok: false, error: `Couldn't send the reset email: ${error.message}` }
  }
  return { ok: true, message: RESET_SENT_MESSAGE }
}

type AmrEntry = string | { method?: string }
export type ClaimsAuth = {
  getClaims(): Promise<{ data: { claims: { amr?: AmrEntry[] } } | null; error: unknown }>
}

/** True only for a verified session that came from a password recovery link (JWT amr includes "recovery"). */
export async function hasRecoverySession(auth: ClaimsAuth): Promise<boolean> {
  try {
    const { data, error } = await auth.getClaims()
    if (error || !data?.claims) return false
    const amr = data.claims.amr
    return Array.isArray(amr) && amr.some(a => (typeof a === 'string' ? a : a?.method) === 'recovery')
  } catch {
    return false
  }
}
