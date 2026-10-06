// Server only. The self-signup age answer, carried from signUpPlayer to
// linkPlayerRow inside the sign-in link's user_metadata. user_metadata is
// client-controlled (anyone can call Supabase's signup with any data), so
// the answer is signed here with a server-only key and bound to the email.
// linkPlayerRow ignores any band it can't verify: the player then answers
// the age screen on their first visit instead.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isAgeBand, type AgeBand } from './age-band'

const VERSION = 'v1'
/** Sign-in links don't live this long; older tokens are ignored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type SignupAgeClaims = { band: AgeBand; answeredAt: string; tosAcceptedAt: string; tosVersion: string }

function key(): Buffer | null {
  // A dedicated secret if set; otherwise one derived from the service role
  // key (server-only already), so no new deploy setting is needed.
  const own = process.env.SIGNUP_AGE_SECRET
  if (own) return Buffer.from(own)
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!service) return null
  return createHmac('sha256', service).update('releasepoint-signup-age-v1').digest()
}

const mac = (k: Buffer, body: string) => createHmac('sha256', k).update(body).digest('base64url')
const norm = (email: string) => email.trim().toLowerCase()

/** Signs the answer for this email; null if no server key is configured. */
export function signSignupAge(email: string, claims: SignupAgeClaims): string | null {
  const k = key()
  if (!k) return null
  const body = Buffer.from(JSON.stringify({ e: norm(email), ...claims })).toString('base64url')
  return `${VERSION}.${body}.${mac(k, `${VERSION}.${body}`)}`
}

/** The claims if `token` was signed here for this email and isn't too old; otherwise null. */
export function verifySignupAge(token: unknown, email: string | null | undefined, now = Date.now()): SignupAgeClaims | null {
  const k = key()
  if (!k || typeof token !== 'string' || !email) return null
  const [v, body, sig] = token.split('.')
  if (v !== VERSION || !body || !sig) return null
  const want = Buffer.from(mac(k, `${v}.${body}`))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  let c: Record<string, unknown>
  try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (c.e !== norm(email) || !isAgeBand(c.band)) return null
  const at = Date.parse(String(c.answeredAt))
  if (Number.isNaN(at) || at > now + 5 * 60 * 1000 || now - at > MAX_AGE_MS) return null
  return {
    band: c.band,
    answeredAt: String(c.answeredAt),
    tosAcceptedAt: typeof c.tosAcceptedAt === 'string' ? c.tosAcceptedAt : String(c.answeredAt),
    tosVersion: typeof c.tosVersion === 'string' ? c.tosVersion : '',
  }
}

// ── Google / Apple signup ────────────────────────────────────────────────────
// The signup page asks the birth month and year (and the Terms) before it
// shows the Google and Apple buttons. 13 or older: this signed answer goes in
// a short-lived httpOnly cookie that the OAuth callback reads once, so the
// person never sees the age screen twice. The email isn't known yet, so the
// token is bound to nothing but this browser (the cookie) and a short life.

const OAUTH_VERSION = 'o1'
/** Name of the cookie the OAuth callback reads (and clears). */
export const OAUTH_AGE_COOKIE = 'rp_oauth_age'
/** Long enough to finish a Google or Apple sign-in. */
export const OAUTH_AGE_MAX_AGE_SECONDS = 15 * 60

function oauthKey(): Buffer | null {
  const k = key()
  return k ? createHmac('sha256', k).update('releasepoint-oauth-age-v1').digest() : null
}

/** Signs a 13+ answer for the OAuth callback; null if no server key is configured or the band is under 13. */
export function signOAuthAge(claims: SignupAgeClaims): string | null {
  const k = oauthKey()
  if (!k || !isAgeBand(claims.band) || claims.band === 'under_13') return null
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${OAUTH_VERSION}.${body}.${mac(k, `${OAUTH_VERSION}.${body}`)}`
}

/** The claims if `token` was signed here for the OAuth callback and is under 15 minutes old; otherwise null. */
export function verifyOAuthAge(token: unknown, now = Date.now()): SignupAgeClaims | null {
  const k = oauthKey()
  if (!k || typeof token !== 'string') return null
  const [v, body, sig] = token.split('.')
  if (v !== OAUTH_VERSION || !body || !sig) return null
  const want = Buffer.from(mac(k, `${v}.${body}`))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  let c: Record<string, unknown>
  try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!isAgeBand(c.band) || c.band === 'under_13') return null
  const at = Date.parse(String(c.answeredAt))
  if (Number.isNaN(at) || at > now + 60 * 1000 || now - at > OAUTH_AGE_MAX_AGE_SECONDS * 1000) return null
  if (typeof c.tosAcceptedAt !== 'string' || typeof c.tosVersion !== 'string' || !c.tosVersion) return null
  return { band: c.band, answeredAt: String(c.answeredAt), tosAcceptedAt: c.tosAcceptedAt, tosVersion: c.tosVersion }
}
