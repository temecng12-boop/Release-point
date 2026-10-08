// Classify Supabase auth-link errors (PKCE query or implicit fragment) so
// /auth/complete never drops a failed sign-in on /auth/login with no message.
//
// Supabase sends ?error=&error_code=&error_description= (or the same in the
// hash). The confirm/callback 303s forward a sanitized copy; the complete
// page also reads the hash the server never sees.

import { RESET_PATH } from './password-reset'

export const AUTH_ERROR_CODE_MAX = 64
export const AUTH_ERROR_DESCRIPTION_MAX = 200

type ParamSource = { get(name: string): string | null }

export type AuthLinkError = {
  error: string | null
  errorCode: string | null
  errorDescription: string | null
}

/** Printable ASCII only, no controls; codes are further restricted. */
export function sanitizeAuthErrorParam(
  raw: string | null,
  max: number,
  kind: 'code' | 'description',
): string {
  if (!raw) return ''
  const stripped = raw.replace(/[\x00-\x1F\x7F]/g, '')
  const allowed = kind === 'code' ? stripped.replace(/[^A-Za-z0-9._-]/g, '') : stripped
  return allowed.slice(0, max)
}

export function readAuthLinkError(query: ParamSource, hash: ParamSource): AuthLinkError {
  const pick = (name: string) => query.get(name) || hash.get(name)
  return {
    error: pick('error'),
    errorCode: pick('error_code'),
    errorDescription: pick('error_description'),
  }
}

export function hasAuthLinkError(err: AuthLinkError): boolean {
  return Boolean(err.error || err.errorCode || err.errorDescription)
}

/**
 * Query suffix for the 303 to /auth/complete. Forwards error=link plus
 * sanitized, length-capped error_code and error_description so the
 * complete page can classify the failure. Empty when nothing to forward.
 */
export function forwardedAuthErrorQuery(searchParams: ParamSource): string {
  if (!searchParams.get('error') && !searchParams.get('error_code') && !searchParams.get('error_description')) {
    return ''
  }
  const q = new URLSearchParams()
  q.set('error', 'link')
  const code = sanitizeAuthErrorParam(searchParams.get('error_code'), AUTH_ERROR_CODE_MAX, 'code')
  const desc = sanitizeAuthErrorParam(searchParams.get('error_description'), AUTH_ERROR_DESCRIPTION_MAX, 'description')
  if (code) q.set('error_code', code)
  if (desc) q.set('error_description', desc)
  return `&${q.toString()}`
}

/**
 * Where /auth/complete sends a Supabase error. Reset links stay on the
 * reset page. The Before User Created hook's invite-only rejection goes
 * to the waitlist. Expired OTPs get invite_expired; everything else
 * invite_failed. Null when there is no error (continue sign-in).
 */
export function completeErrorRedirect(next: string, err: AuthLinkError): string | null {
  if (!hasAuthLinkError(err)) return null
  if (next === RESET_PATH) return `${RESET_PATH}?error=link`
  const desc = (err.errorDescription ?? '').toLowerCase()
  if (desc.includes('invite-only')) return '/waitlist?reason=invite_only'
  const code = (err.errorCode ?? '').toLowerCase()
  const blob = `${code} ${desc} ${(err.error ?? '').toLowerCase()}`
  if (code === 'otp_expired' || blob.includes('expired')) return '/auth/login?error=invite_expired'
  return '/auth/login?error=invite_failed'
}
