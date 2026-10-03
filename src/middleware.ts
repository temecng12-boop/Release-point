import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPublicAssetPath } from '@/lib/public-paths'

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
  if (user && isAuthRoute && pathname !== '/auth/callback' && pathname !== '/auth/confirm' && pathname !== '/auth/reset') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Keep in step with src/lib/public-paths.ts (tested there).
    '/((?!_next/static|_next/image|favicon\\.ico$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|(?:apple-icon|icon)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:/[^/]*)?$|(?:.*/)?(?:opengraph-image|twitter-image)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:/[^/]*)?$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|html|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)',
  ],
}
