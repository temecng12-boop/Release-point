import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { RESET_PATH } from '@/lib/password-reset'
import { findInviteForEmail, isBrandNewUser } from '@/lib/invite-gate'
import { finishInviteAcceptance, postAcceptRedirect, rejectStrayUser } from '@/lib/invite-accept'
import { fragmentFallbackHtml } from '@/lib/fragment-fallback'

const VALID_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change'])

function isExpiredError(error: { message?: string | null; code?: string | null } | null): boolean {
  if (!error) return false
  if (typeof error.code === 'string' && error.code.toLowerCase().includes('expired')) return true
  return /expired|invalid/i.test(error.message ?? '')
}

/**
 * Accepts a token_hash link (?token_hash=…&type=…&next=…): invite emails
 * (built from generateLink's hashed_token), OTP/magic-link signups, and
 * password-recovery links. verifyOtp sets the session cookies server-side,
 * so no fragment handling is needed. Then the same invite-only gate and
 * acceptance work as /auth/callback run, and the user is redirected onward.
 *
 * Without token_hash params (an old IMPLICIT-flow email, whose tokens sit in
 * the URL fragment the server never sees, or a stray visit) the fragment
 * fallback page is served instead. Failures redirect to login with an honest,
 * specific error -- never a silent dashboard redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const rawType = searchParams.get('type')
  const type = (rawType && VALID_TYPES.has(rawType) ? rawType : null) as EmailOtpType | null
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard', origin)
  const failed = (code: 'invite_expired' | 'invite_failed') =>
    next === RESET_PATH ? `${origin}${RESET_PATH}?error=link` : `${origin}/auth/login?error=${code}`

  if (!token_hash || !type) {
    // Old fragment link or stray visit: let the browser finish it, or bounce
    // a hash-less visit back to login from the fallback page.
    return new Response(fragmentFallbackHtml(next, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({ token_hash, type })
  if (error) {
    console.error('[auth/confirm] verify failed', { type, code: (error as { code?: string }).code ?? null })
    return NextResponse.redirect(failed(isExpiredError(error) ? 'invite_expired' : 'invite_failed'))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(failed('invite_failed'))

  // Same invite-only gate as /auth/callback: brand-new accounts with no
  // matching invite are removed and sent to the waitlist.
  if (user.email && isBrandNewUser(user)) {
    const invite = await findInviteForEmail(supabaseAdmin, user.email)
    if (invite === 'none') {
      await rejectStrayUser(supabaseAdmin, () => supabase.auth.signOut({ scope: 'local' }), user.id)
      return NextResponse.redirect(`${origin}/waitlist?reason=invite_only`)
    }
  }

  const { linkedPlayers } = await finishInviteAcceptance(supabaseAdmin, user)
  return NextResponse.redirect(`${origin}${postAcceptRedirect(next, linkedPlayers.length)}`)
}
