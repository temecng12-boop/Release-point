import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { needsFirstAgeScreen, type PlayerConsentFields } from '@/lib/consent'
import { AGE_STOP_COOKIE } from '@/lib/age-band'
import AgeScreenForm from '@/app/dashboard/age-screen-form'
import Under13Stop from '@/components/under13-stop'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// First sign-in for a coach-invited player (or a new account with no coach,
// e.g. a Google or Apple sign-up): the neutral birth month/year
// screen, before any other screen (spec T1). The dashboard and onboarding
// send the player here until they have answered.
export default async function AgeScreenPage() {
  if ((await cookies()).get(AGE_STOP_COOKIE)) return <Shell><Under13Stop /></Shell>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: player } = await selectPlayersWithConsent<{ id: string; coach_id: string | null; guardian_id: string | null; user_id: string | null; position: string | null } & PlayerConsentFields>(
    'id, coach_id, guardian_id, user_id, position',
    (cols) => supabaseAdmin.from('players').select(cols).eq('user_id', user.id).maybeSingle(),
  )
  if (!needsFirstAgeScreen(player)) redirect('/dashboard')

  return (
    <Shell>
      <p className="text-[11px] text-[#E8102A] tracking-[0.3em] mb-2" style={os}>One Quick Question</p>
      <h1 className="text-xl text-slate-950 mb-6 tracking-tight" style={os}>Before You Start</h1>
      <AgeScreenForm next="/dashboard" />
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
