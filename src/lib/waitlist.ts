/**
 * Waitlist join helpers: validation messages, rate-limit bucket (in-memory,
 * per serverless instance), and the insert / notify outcome rules.
 * Pure pieces are tested in src/lib/__tests__/waitlist.test.ts.
 */

export const WAITLIST_ALREADY =
  "You're already on the list — we'll be in touch when your spot is ready."
export const WAITLIST_SAVED = 'ok' as const
export const WAITLIST_INVALID_EMAIL = 'Please enter a valid email address.'
export const WAITLIST_RATE_LIMITED =
  "You've tried a few times in a short span. Please wait a minute and try again."
export const WAITLIST_SAVE_FAILED =
  "Couldn't add you to the waitlist right now. Please try again in a moment."
export const WAITLIST_BOTH_FAILED =
  "Couldn't save your spot or send a confirmation. Please try again in a moment."

/** Per email and per IP: at most this many accepted attempts per window. */
export const WAITLIST_RATE_MAX = 5
export const WAITLIST_RATE_WINDOW_MS = 10 * 60 * 1000

const hits = new Map<string, number[]>()

/** Trim old timestamps; return whether this key is over the limit after recording `now`. */
export function waitlistRateLimited(key: string, now = Date.now(), store: Map<string, number[]> = hits): boolean {
  const cut = now - WAITLIST_RATE_WINDOW_MS
  const prev = (store.get(key) ?? []).filter(t => t > cut)
  if (prev.length >= WAITLIST_RATE_MAX) {
    store.set(key, prev)
    return true
  }
  prev.push(now)
  store.set(key, prev)
  return false
}

/** Test helper: clear the default in-memory store. */
export function resetWaitlistRateLimitForTests() {
  hits.clear()
}

export function normalizeWaitlistEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidWaitlistEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizeWaitlistName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return null
  return name.slice(0, 200)
}

/**
 * Decide the UI result after the DB insert and the founder email attempt.
 * - Unique violation (23505): treat as success (idempotent).
 * - Other DB error + email failed: hard error (both failed).
 * - Other DB error + email ok: hard error (row not saved; never "You're on the list").
 * - DB ok + email fail: soft success (row is what matters).
 */
export function waitlistJoinOutcome(opts: {
  dbError: { code?: string; message?: string } | null
  emailOk: boolean
}): { success: true; already?: boolean } | { error: string } {
  const code = opts.dbError?.code
  if (!opts.dbError) {
    return { success: true }
  }
  if (code === '23505') {
    return { success: true, already: true }
  }
  if (!opts.emailOk) return { error: WAITLIST_BOTH_FAILED }
  return { error: WAITLIST_SAVE_FAILED }
}

/** Client IP for rate limiting (first x-forwarded-for hop, else x-real-ip). */
export function clientIpFromHeaders(h: { get(name: string): string | null }): string {
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first.slice(0, 128)
  }
  const real = h.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 128)
  return 'unknown'
}
