import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { needsAgeConfirm, type PlayerConsentFields } from '@/lib/consent'
import { AGE_STOP_COOKIE } from '@/lib/age-band'
import { agePageRoute } from '@/lib/age-gate-routing'
import { freezeUnder13Account } from '@/lib/under13-freeze'
import { confirmAgeAndTerms } from '@/app/actions/age'
import AgeConfirmForm from '@/components/age-confirm-form'
import AgeStopNotice from '@/components/age-stop-notice'
import AccountLoadError from '@/components/account-load-error'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type PlayerRow = { id: string; full_name: string | null } & PlayerConsentFields

// The one screen for a signed-in player whose age isn't confirmed yet: a
// coach-invited player accepting the invite, or someone who used Google or
// Apple from the sign-in page. Same fields as self-signup (birth month and
// year, name, Terms; the email is the signed-in one). Shown once: the
// dashboard and onboarding send the player here until it's answered.
// Redirects only on a confirmed state; a failed or missing read shows an
// error with Try again and Sign out (src/lib/age-gate-routing.ts).
export default async function AgeConfirmPage() {
  const stopCookie = !!(await cookies()).get(AGE_STOP_COOKIE)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    if (stopCookie) return <Shell><AgeStopNotice /></Shell>
    redirect('/auth/login')
  }

  const profile = await supabaseAdmin.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
  const player = profile.data?.role === 'player'
    ? await selectPlayersWithConsent<PlayerRow>('id, full_name', (cols) => supabaseAdmin.from('players').select(cols).eq('user_id', user.id).maybeSingle())
    : null

  const route = agePageRoute(stopCookie, profile, player)
  if (route === 'stop') {
    // This browser answered under 13 in the last 24 hours. A player account
    // that hasn't answered yet (e.g. a Google sign-in from the sign-in page
    // right after) is frozen and blanked the same way as an answer here.
    if (profile.data?.role === 'player' && player && !player.error && needsAgeConfirm(player.data)) {
      await freezeUnder13Account(supabaseAdmin, user.id)
    }
    return <Shell><AgeStopNotice /></Shell>
  }
  if (route === 'error') {
    console.error('[onboarding/age] account read failed', { userId: user.id, profile: !!profile.error, player: !!player?.error })
    return <AccountLoadError retryHref="/onboarding/age" />
  }
  if (route === 'dashboard') redirect('/dashboard')

  const defaultName = player?.data?.full_name || profile.data?.full_name || (user.user_metadata?.full_name as string | undefined) || ''
  return (
    <Shell>
      <p className="text-[11px] text-[#E8102A] tracking-[0.3em] mb-2" style={os}>Welcome</p>
      <h1 className="text-xl text-slate-950 mb-6 tracking-tight" style={os}>Finish Setting Up</h1>
      <AgeConfirmForm mode="account" action={confirmAgeAndTerms} defaultName={defaultName} email={user.email} next="/onboarding" />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="sm" /></div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">{children}</div>
      </div>
    </div>
  )
}
