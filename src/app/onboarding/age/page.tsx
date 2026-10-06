import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { needsAgeConfirm, type PlayerConsentFields } from '@/lib/consent'
import { AGE_STOP_COOKIE } from '@/lib/age-band'
import { confirmAgeAndTerms } from '@/app/actions/age'
import AgeConfirmForm from '@/components/age-confirm-form'
import AgeStopNotice from '@/components/age-stop-notice'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// The one screen for a signed-in player whose age isn't confirmed yet: a
// coach-invited player accepting the invite, or a Google/Apple sign-up at
// first sign-in. Same fields as self-signup (birth month and year, name,
// Terms; the email is the signed-in one). Shown once: the dashboard and
// onboarding send the player here until it's answered, then never again.
export default async function AgeConfirmPage() {
  if ((await cookies()).get(AGE_STOP_COOKIE)) return <Shell><AgeStopNotice /></Shell>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'player') redirect('/dashboard')

  const { data: player, error } = await selectPlayersWithConsent<{ id: string; full_name: string | null } & PlayerConsentFields>(
    'id, full_name',
    (cols) => supabaseAdmin.from('players').select(cols).eq('user_id', user.id).maybeSingle(),
  )
  if (error || !needsAgeConfirm(player)) redirect('/dashboard')

  const defaultName = player?.full_name || profile?.full_name || (user.user_metadata?.full_name as string | undefined) || ''
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
