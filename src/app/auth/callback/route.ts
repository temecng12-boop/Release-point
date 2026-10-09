import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { RESET_PATH } from '@/lib/password-reset'
import { OAUTH_AGE_COOKIE } from '@/lib/signup-age-token'
import { applyOAuthSignupAge, rescrubFrozenAccount } from '@/lib/oauth-signup-age'
import { findInviteForEmail, isBrandNewUser } from '@/lib/invite-gate'
import { finishInviteAcceptance, postAcceptRedirect, rejectStrayUser } from '@/lib/invite-accept'
import { forwardedAuthErrorQuery } from '@/lib/auth-link-error'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard', origin)
  // A failed or expired password reset link goes back to the reset page, which explains it.
  const failed = next === RESET_PATH ? `${origin}${RESET_PATH}?error=link` : `${origin}/auth/login?error=confirmation_failed`

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

  let sessionError: unknown = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    sessionError = error
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    sessionError = error
  }

  if (!sessionError) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // No server-side params and no session: this may be an old IMPLICIT-flow
      // link (tokens in the URL fragment, which never reach the server).
      // Browsers carry the fragment across a redirect whose Location has no
      // fragment of its own, so the bundled /auth/complete page can finish
      // the sign-in there; a stray visit without a hash lands on login.
      if (!code && !(token_hash && type)) {
        const errorQ = forwardedAuthErrorQuery(searchParams)
        return NextResponse.redirect(`${origin}/auth/complete?next=${encodeURIComponent(next)}${errorQ}`, { status: 303 })
      }
      return NextResponse.redirect(failed)
    }
    // Invite-only gate (defense in depth behind the Before User Created
    // hook): an account created by THIS request with no matching invite
    // (unlinked players row or pending coach_invites row, matched on
    // lower(trim(email))) is removed and sent to the waitlist. Existing
    // users -- coaches, current players, open-beta accounts without roster
    // rows -- have old created_at values and never reach the rejection.
    if (user.email && isBrandNewUser(user)) {
      const invite = await findInviteForEmail(supabaseAdmin, user.email)
      if (invite === 'none') {
        await rejectStrayUser(supabaseAdmin, () => supabase.auth.signOut({ scope: 'local' }), user.id)
        return NextResponse.redirect(`${origin}/waitlist?reason=invite_only`)
      }
    }
    // Link the invited players row, notify the coach, consume a pending
    // coach invite (shared with /auth/confirm).
    const { linkedPlayers } = await finishInviteAcceptance(supabaseAdmin, user)
    // Google/Apple from the signup page: the birth month/year and Terms were
    // asked before the buttons (startOAuthSignup). Store that answer once, so
    // the age screen isn't shown again; read the cookie once, then clear it.
    const oauthAge = cookieStore.get(OAUTH_AGE_COOKIE)?.value
    if (oauthAge) {
      cookieStore.delete(OAUTH_AGE_COOKIE)
      const outcome = await applyOAuthSignupAge(supabaseAdmin, user, oauthAge)
      if (outcome === 'failed') console.warn('[auth/callback] signup age answer not stored; the age screen will ask', { userId: user.id })
    }
    // A frozen under-13 account signing in again: Supabase copies the
    // provider's name and photo back into the auth metadata; remove them.
    if (code) await rescrubFrozenAccount(supabaseAdmin, user.id)

    // Brand-new coaches go to the dedicated onboarding page instead of the
    // dashboard. isBrandNewUser uses a 5-min window — covers email confirm
    // but not repeat logins or password resets.
    if (isBrandNewUser(user) && linkedPlayers.length === 0) {
      const { data: newProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (newProfile?.role === 'coach' && next !== '/onboarding/coach') {
        return NextResponse.redirect(`${origin}/onboarding/coach`)
      }
    }

    return NextResponse.redirect(`${origin}${postAcceptRedirect(next, linkedPlayers.length)}`)
  }

  return NextResponse.redirect(failed)
}
