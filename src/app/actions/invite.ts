'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function invitePlayer(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') return { error: 'Only coaches can invite players' }

  const playerName    = (formData.get('full_name') as string).trim()
  const guardianName  = (formData.get('guardian_name') as string).trim()
  const guardianEmail = (formData.get('guardian_email') as string).trim().toLowerCase()
  const teamId        = (formData.get('team_id') as string | null)?.trim() || null

  // Create guardian record
  const { data: guardian, error: guardianError } = await supabase
    .from('guardians')
    .insert({ email: guardianEmail, full_name: guardianName })
    .select('id')
    .single()

  if (guardianError) {
    if (guardianError.code === '23505') return { error: 'A guardian with this email has already been invited.' }
    return { error: guardianError.message }
  }

  // Create player linked to guardian
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ coach_id: user.id, full_name: playerName, guardian_id: guardian.id, team_id: teamId })
    .select('id')
    .single()

  if (playerError) {
    await supabase.from('guardians').delete().eq('id', guardian.id)
    return { error: playerError.message }
  }

  // Magic link goes to the guardian, redirecting to the consent page after auth
  const consentUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent('/guardian/consent?player_id=' + player.id)}`

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: guardianEmail,
    options: {
      data: { role: 'guardian', full_name: guardianName },
      emailRedirectTo: consentUrl,
    },
  })

  if (otpError) return { error: otpError.message }

  revalidatePath('/', 'layout')
  return { success: `Consent request sent to ${guardianEmail}` }
}
