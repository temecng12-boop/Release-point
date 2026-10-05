import { AGE_STOP_COOKIE } from './age-band'

type CookieJar = { set(name: string, value: string, options: Record<string, unknown>): unknown }

/** How long another age answer is blocked after an under-13 one (spec: 24 hours). */
export const AGE_STOP_MAX_AGE_SECONDS = 60 * 60 * 24

/**
 * Sets the cookie that blocks another age answer for 24 hours after an
 * under-13 one. httpOnly (page scripts can't clear it), secure, sameSite=lax.
 * Browsers treat http://localhost as secure, so local dev still works.
 */
export function setAgeStopCookie(jar: CookieJar) {
  jar.set(AGE_STOP_COOKIE, '1', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: AGE_STOP_MAX_AGE_SECONDS })
}
