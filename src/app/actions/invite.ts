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
    .insert({ coach_id: user.id, full_name: playerName, email: playerEmail })
    .select('id')
    .single()

  if (playerError && playerError.code !== '23505') return { error: playerError.message }

  // Resolve player id — either newly inserted or existing (on duplicate key)
  let playerId = player?.id ?? null
  if (playerError?.code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('coach_id', user.id)
      .eq('email', playerEmail)
      .single()
    playerId = existing?.id ?? null
  }

  // Assign teams via junction table (new assignments only, ignore duplicates)
  if (playerId && teamIds.length > 0) {
    await supabaseAdmin.from('player_teams').upsert(
      teamIds.map((tid) => ({ player_id: playerId, team_id: tid })),
      { onConflict: 'player_id,team_id', ignoreDuplicates: true }
    )
  }

  // Send invite email via Supabase Auth
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://release-point.vercel.app'
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
