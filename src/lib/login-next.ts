// The ?next= round trip through sign-in: a signed-out visit to a page goes to
// /auth/login?next=<that page>, and sign-in (password, email link, Google or
// Apple) comes back to it. Only same-site paths (safeRedirectPath).
import { safeRedirectPath } from './safe-redirect'

/** Search string for the login redirect of a signed-out request. */
export function loginRedirectSearch(pathname: string, search: string): string {
  const target = safeRedirectPath(`${pathname}${search}`, '')
  if (!target || target === '/dashboard') return ''
  return `?next=${encodeURIComponent(target)}`
}

/** Where a signed-in visit to /auth/login or /auth/signup goes. */
export function signedInAuthRedirect(next: string | null): string {
  return safeRedirectPath(next, '/dashboard')
}

/** emailRedirectTo / OAuth redirectTo for the login page, carrying ?next=. */
export function authCallbackUrl(origin: string, next: string | null | undefined): string {
  const target = safeRedirectPath(next, '', origin)
  return target ? `${origin}/auth/callback?next=${encodeURIComponent(target)}` : `${origin}/auth/callback`
}
