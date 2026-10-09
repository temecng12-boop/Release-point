import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import CoachOnboardingFlow from './coach-onboarding-flow'

export default async function CoachOnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') redirect('/dashboard')

  // Already has teams → no need for onboarding
  const { count } = await supabaseAdmin
    .from('team_coaches')
    .select('*', { count: 'exact', head: true })
    .eq('coach_id', user.id)

  if (count && count > 0) redirect('/dashboard')

  return (
    <CoachOnboardingFlow
      coachName={profile?.full_name ?? user.email?.split('@')[0] ?? 'Coach'}
    />
  )
}
