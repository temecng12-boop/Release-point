import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPlayerJoinedEmail } from '@/lib/email'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

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
      return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`)
    }
    // Link player row to this auth account (for invited players)
    if (user.email) {
      const { data: updatedPlayers } = await supabaseAdmin
        .from('players')
        .update({ user_id: user.id, accepted_at: new Date().toISOString() })
        .eq('email', user.email)
        .is('user_id', null)
        .select('id, full_name, coach_id')

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
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`)
}
