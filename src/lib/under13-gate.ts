// The frozen under-13 gate (hard stop, src/lib/under13-mode.ts), in one
// place: the middleware runs it on every request from a signed-in account.
// A frozen account (isFrozenUnder13: an under-13 band from the player's or
// the coach's answer) gets the stop screen on every page, a 403 from every
// API route, and a 403 for every server action. Server action ids are
// global (not tied to the page), so all of them are refused; signing out
// uses the POST /auth/signout route instead.
import { NextResponse, type NextRequest } from 'next/server'
import { isFrozenUnder13 } from './consent'
import { UNDER_13_STOP_MESSAGE } from './under13-mode'

export const UNDER_13_STOP_PATH = '/under-13'
export const SIGN_OUT_ROUTE = '/auth/signout'

// Pages a frozen account may still open: the stop screen, sign-out, and the
// public marketing and legal pages. Everything else is player data.
const OPEN_EXACT = new Set([UNDER_13_STOP_PATH, SIGN_OUT_ROUTE, '/', '/about', '/home', '/waitlist'])
const OPEN_PREFIX = ['/privacy', '/terms']

export type GateKind = 'open' | 'page' | 'api' | 'action'

/** What a request from a frozen account is. */
export function frozenGateKind(pathname: string, isServerAction: boolean): GateKind {
  if (isServerAction) return 'action'
  if (pathname === '/api' || pathname.startsWith('/api/')) return 'api'
  if (OPEN_EXACT.has(pathname) || OPEN_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'open'
  return 'page'
}

export type GateDb = { from(table: string): { select(cols: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }> } } } }

/**
 * True if this account's player row is frozen. Read with the user's own
 * session (players: own row). A read error (including before migration 037)
 * doesn't block: video stays blocked by the database either way.
 */
export async function isFrozenAccount(db: GateDb, userId: string): Promise<boolean> {
  const { data, error } = await db.from('players')
    .select('age_band, age_band_coach, age_band_self, age_confirmed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[under13-gate] player read failed; not blocking', { message: error.message ?? null })
    return false
  }
  return isFrozenUnder13(data as Parameters<typeof isFrozenUnder13>[0])
}

/** The response for a frozen account; `base` carries the refreshed session cookies. */
export function frozenResponse(kind: Exclude<GateKind, 'open'>, request: NextRequest, base: NextResponse): NextResponse {
  let res: NextResponse
  if (kind === 'api') res = NextResponse.json({ error: UNDER_13_STOP_MESSAGE }, { status: 403 })
  else if (kind === 'action') res = new NextResponse(UNDER_13_STOP_MESSAGE, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  else {
    const url = request.nextUrl.clone()
    url.pathname = UNDER_13_STOP_PATH
    url.search = ''
    res = NextResponse.rewrite(url, { request })
  }
  for (const c of base.cookies.getAll()) res.cookies.set(c)
  res.headers.set('cache-control', 'private, no-store')
  return res
}
