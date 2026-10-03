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
