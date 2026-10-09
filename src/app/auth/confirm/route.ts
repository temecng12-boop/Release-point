import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { RESET_PATH } from '@/lib/password-reset'
import { findInviteForEmail, isBrandNewUser } from '@/lib/invite-gate'
import { finishInviteAcceptance, postAcceptRedirect, rejectStrayUser } from '@/lib/invite-accept'
import { forwardedAuthErrorQuery } from '@/lib/auth-link-error'

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
 * the URL fragment the server never sees, or a stray visit) the request is
 * 303'd to the bundled /auth/complete page. Browsers keep a Location-less
 * fragment across that redirect, so setSession can finish in bundled code.
 * Failures redirect to login with an honest, specific error -- never a
 * silent dashboard redirect.
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
    // A ?code= link (e.g. Supabase-sent recovery) is server-readable: keep it
    // in the query and let /auth/callback verify it. Anything else may be an
    // old IMPLICIT-flow email (tokens in the fragment, which never reach the
    // server) or a stray visit: 303 to the bundled /auth/complete page, whose
    // Location carries no fragment of its own so browsers keep the hash.
    // A reset or auth ?error= is forwarded (plus sanitized error_code /
    // error_description) so the complete page can classify it — the 303
    // would otherwise drop the query. The hash, if any, is kept by the browser.
    if (searchParams.get('code')) {
      const url = new URL(`${origin}/auth/callback`)
      url.searchParams.set('code', searchParams.get('code') as string)
      url.searchParams.set('next', next)
      return NextResponse.redirect(url, { status: 303 })
    }
    const errorQ = forwardedAuthErrorQuery(searchParams)
    return NextResponse.redirect(`${origin}/auth/complete?next=${encodeURIComponent(next)}${errorQ}`, { status: 303 })
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

  // Assistant coach invite: join_team param encodes the team to join
  const joinTeam = searchParams.get('join_team')
  if (joinTeam) {
    const { error: joinErr } = await supabaseAdmin
      .from('team_coaches')
      .upsert(
        { team_id: joinTeam, coach_id: user.id, role: 'assistant' },
        { onConflict: 'team_id,coach_id', ignoreDuplicates: true },
      )
    if (joinErr) console.error('[auth/confirm] join_team insert failed', { code: joinErr.code })
  }

  // Brand-new coaches go to the dedicated onboarding page.
  if (isBrandNewUser(user) && linkedPlayers.length === 0 && !joinTeam) {
    const { data: newProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (newProfile?.role === 'coach') {
      return NextResponse.redirect(`${origin}/onboarding/coach`)
    }
  }

  return NextResponse.redirect(`${origin}${postAcceptRedirect(next, linkedPlayers.length)}`)
}
