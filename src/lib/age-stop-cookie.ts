import { AGE_STOP_COOKIE } from './age-band'

type CookieJar = { set(name: string, value: string, options: Record<string, unknown>): unknown }

/**
 * Sets the session cookie that blocks another age answer after an under-13
 * one (no Max-Age: it ends with the browser session). httpOnly, so page
 * scripts can't clear it.
 */
export function setAgeStopCookie(jar: CookieJar) {
  jar.set(AGE_STOP_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
}
