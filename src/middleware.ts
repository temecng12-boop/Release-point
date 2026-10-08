import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPublicAssetPath } from '@/lib/public-paths'
import { frozenGateKind, frozenResponse, isFrozenAccount, SIGN_OUT_ROUTE, type GateDb } from '@/lib/under13-gate'
import { AGE_SCREEN_MESSAGE, AGE_SCREEN_PATH, isAgeGateSetupPath, needsAgeScreen, type AgeScreenDb } from '@/lib/age-screen-gate'

export async function middleware(request: NextRequest) {
  // Manifest, icons, sw.js, robots, social images, static files: public, no
  // session work (QA-013). The matcher below already skips them; this is a backstop.
  if (isPublicAssetPath(request.nextUrl.pathname)) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session and syncs cookies on every request
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute  = pathname.startsWith('/auth')
  const isPublicPath = pathname === '/' || pathname === '/about' || pathname === '/home' || pathname === '/waitlist' || pathname.startsWith('/privacy') || pathname.startsWith('/terms') || isAuthRoute

  // Never redirect server action requests — they carry a `next-action` header
  // and expect either an RSC response or an `x-action-redirect` header.
  // A plain HTTP redirect causes "An unexpected response was received from the server."
  const isServerAction = Boolean(request.headers.get('next-action'))

  if (!user && !isPublicPath && !isServerAction) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // /auth/reset is opened signed in (the reset link's recovery session).
  if (user && isAuthRoute && pathname !== '/auth/callback' && pathname !== '/auth/confirm' && pathname !== '/auth/reset' && pathname !== SIGN_OUT_ROUTE) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Frozen under-13 account (hard stop): the stop screen on every player page,
  // 403 on API routes and server actions (src/lib/under13-gate.ts).
  // Unanswered age screen (one screen): the age screen on every player page,
  // 403 on API routes and server actions -- except the setup paths the
  // account needs to finish (src/lib/age-screen-gate.ts). Coaches and
  // guardians have no age screen and are never gated.
  if (user) {
    const kind = frozenGateKind(pathname, isServerAction)
    if (kind !== 'open' && (await isFrozenAccount(supabase as unknown as GateDb, user.id))) {
      return frozenResponse(kind, request, supabaseResponse)
    }
    if (kind !== 'open' && !isAgeGateSetupPath(pathname) && (await needsAgeScreen(supabase as unknown as AgeScreenDb, user.id))) {
      let res: NextResponse
      if (kind === 'api') res = NextResponse.json({ error: AGE_SCREEN_MESSAGE }, { status: 403 })
      else if (kind === 'action') res = new NextResponse(AGE_SCREEN_MESSAGE, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      else {
        const url = request.nextUrl.clone()
        url.pathname = AGE_SCREEN_PATH
        url.search = ''
        res = NextResponse.redirect(url)
      }
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c)
      res.headers.set('cache-control', 'private, no-store')
      return res
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Keep in step with src/lib/public-paths.ts (tested there).
    '/((?!_next/static|_next/image|favicon\\.ico$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|(?:apple-icon|icon)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:/[^/]*)?$|(?:.*/)?(?:opengraph-image|twitter-image)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:/[^/]*)?$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|html|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)',
  ],
}
