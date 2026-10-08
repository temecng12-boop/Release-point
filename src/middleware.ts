import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
  const isAuthRoute = pathname.startsWith('/auth')

  // Only redirect to login for known app paths that require auth.
  // Unknown paths fall through to Next.js which renders the real 404.
  const isProtectedPath =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/clips') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/player-settings') ||
    pathname.startsWith('/guardian')

  // Never redirect server action requests — they carry a `next-action` header
  // and expect either an RSC response or an `x-action-redirect` header.
  const isServerAction = Boolean(request.headers.get('next-action'))

  if (!user && isProtectedPath && !isServerAction) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute && pathname !== '/auth/callback' && pathname !== '/auth/confirm') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
}
