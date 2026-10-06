import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPlayerJoinedEmail } from '@/lib/email'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { RESET_PATH } from '@/lib/password-reset'
import { OAUTH_AGE_COOKIE } from '@/lib/signup-age-token'
import { applyOAuthSignupAge, rescrubFrozenAccount } from '@/lib/oauth-signup-age'
import { acceptCoachInvite } from '@/lib/coach-invite-accept'

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
      return NextResponse.redirect(failed)
    }
    // Link player row to this auth account (for invited players)
    let updatedPlayers: { id: string; full_name: string; coach_id: string | null }[] | null = null
    if (user.email) {
      const { data: linked } = await supabaseAdmin
        .from('players')
        .update({ user_id: user.id, accepted_at: new Date().toISOString() })
        .eq('email', user.email)
        .is('user_id', null)
        .select('id, full_name, coach_id')
      updatedPlayers = linked

      // Notify coach that player accepted invite
      for (const player of updatedPlayers ?? []) {
        if (player.coach_id) {
          try {
            const { data: coachProfile } = await supabaseAdmin
              .from('profiles')
              .select('full_name')
              .eq('id', player.coach_id)
              .single()
            const { data: coachUser } = await supabaseAdmin.auth.admin.getUserById(player.coach_id)
            if (coachUser?.user?.email) {
              await sendPlayerJoinedEmail({
                coachEmail: coachUser.user.email,
                coachName: coachProfile?.full_name ?? 'Coach',
                playerName: player.full_name,
                playerId: player.id,
              })
            }
          } catch { /* email is non-critical */ }
        }
      }
    }
    // Early-access coach invite: mark it used and finish the coach setup
    // (role + Terms). Best-effort: sign-in itself is never blocked.
    if (user.email) {
      try {
        await acceptCoachInvite(supabaseAdmin, user)
      } catch (err) {
        console.error('[auth/callback] coach invite accept failed', { userId: user.id, error: err instanceof Error ? err.message : err })
      }
    }
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
    if (user.email) {
      // New invited player — send to onboarding to pick position + give consent
      if ((updatedPlayers ?? []).length > 0 && next !== RESET_PATH) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    }
    return NextResponse.redirect(`${origin}${safeRedirectPath(next, '/dashboard', origin)}`)
  }

  return NextResponse.redirect(failed)
}
