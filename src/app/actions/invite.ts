'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function invitePlayer(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') return { error: 'Only coaches can invite players' }

  const playerName  = ((formData.get('full_name') as string | null) ?? '').trim()
  const playerEmail = ((formData.get('guardian_email') as string | null) ?? '').trim().toLowerCase()
  const teamId  = formData.get('team_id') as string | null
  const teamIds = teamId ? [teamId] : (formData.getAll('team_ids') as string[])

  if (!playerEmail) return { error: 'Guardian email is required' }

  // Create player row
  const { data: player, error: playerError } = await supabaseAdmin
    .from('players')
    .insert({
      coach_id:  user.id,
      full_name: playerName,
      email:     playerEmail,
    })
    .select('id')
    .single()

  if (playerError) return { error: playerError.message }

  // Assign teams via junction table
  if (teamIds.length > 0) {
    await supabaseAdmin.from('player_teams').insert(
      teamIds.map((tid) => ({ player_id: player.id, team_id: tid }))
    )
  }

  // Send invite email via Supabase Auth
  const siteUrl = 'https://release-point.vercel.app'
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(playerEmail, {
    data: { role: 'player' },
    redirectTo: `${siteUrl}/auth/confirm`,
  })

  // If they already have an account, that's fine — player row is created
  if (inviteErr && !inviteErr.message.toLowerCase().includes('already')) {
    return { error: `Player added but invite email failed: ${inviteErr.message}` }
  }

  revalidatePath('/', 'layout')
  return {
    success: `Invite sent to ${playerEmail}! ${playerName ? `${playerName} will` : 'They will'} receive an email to set up their account.`,
  }
}
