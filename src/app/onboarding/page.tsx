import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PositionPicker from './position-picker'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: playerRow } = await supabase
    .from('players')
    .select('id, position, full_name')
    .eq('user_id', user.id)
    .single()

  // If already has position, go to dashboard
  if (playerRow?.position) redirect('/dashboard')

  return (
    <PositionPicker
      playerId={playerRow?.id ?? ''}
      playerName={playerRow?.full_name ?? ''}
    />
  )
}
