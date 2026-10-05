import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import PositionPicker from './position-picker'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { isFrozenUnder13, needsFirstAgeScreen, type PlayerConsentFields } from '@/lib/consent'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: playerRow } = await selectPlayersWithConsent<{ id: string; position: string | null; full_name: string | null; coach_id: string | null } & PlayerConsentFields>(
    'id, position, full_name, coach_id',
    (cols) => supabaseAdmin.from('players').select(cols).eq('user_id', user.id).single(),
  )

  // The age screen comes first (037); an under-13 player sees only the stop
  // message on the dashboard. If already has position, go to dashboard.
  if (needsFirstAgeScreen(playerRow)) redirect('/onboarding/age')
  if (playerRow?.position || isFrozenUnder13(playerRow)) redirect('/dashboard')

  return (
    <PositionPicker
      playerId={playerRow?.id ?? ''}
      playerName={playerRow?.full_name ?? ''}
    />
  )
}
