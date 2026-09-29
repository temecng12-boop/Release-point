'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPlayerInviteEmail } from '@/lib/email'
import { SELF_SIGNED_UP_PLAYER_MESSAGE, teamIdsNotOwned } from '@/lib/auth/roster-access'

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
  const playerEmail = ((formData.get('player_email') as string | null) ?? '').trim().toLowerCase()
  const teamId  = formData.get('team_id') as string | null
  const teamIds = [...new Set((teamId ? [teamId] : (formData.getAll('team_ids') as string[])).filter(Boolean))]

  if (!playerEmail) return { error: 'Player email is required' }

  // Every team in the invite must belong to this coach. Checked before any
  // player row is created or claimed.
  if (teamIds.length > 0) {
    const { data: ownedTeams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('coach_id', user.id)
      .in('id', teamIds)
    if (teamsError) return { error: 'Could not check teams. Please try again.' }
    const owned = ((ownedTeams ?? []) as { id: string }[]).map((t) => t.id)
    if (teamIdsNotOwned(teamIds, owned).length > 0) return { error: 'Invalid team' }
  }

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
    // Player with this email already exists — could be unlinked or another coach's player
    const { data: existing } = await supabaseAdmin
      .from('players')
      .select('id, coach_id')
      .eq('email', playerEmail)
      .maybeSingle()

    if (existing) {
      if (!existing.coach_id) {
        // Signed up on their own with no coach. Knowing their email is not
        // enough to attach them to a roster, so refuse rather than claim them.
        return { error: SELF_SIGNED_UP_PLAYER_MESSAGE }
      } else if (existing.coach_id === user.id) {
        playerId = existing.id
      } else {
        return { error: 'This player is already linked to another coach.' }
      }
    }
  }

  // Assign teams via junction table (new assignments only, ignore duplicates)
  if (playerId && teamIds.length > 0) {
    await supabaseAdmin.from('player_teams').upsert(
      teamIds.map((tid) => ({ player_id: playerId, team_id: tid })),
      { onConflict: 'player_id,team_id', ignoreDuplicates: true }
    )
  }

  // Generate invite link via Supabase, send email via Resend
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: playerEmail,
    options: {
      data: { role: 'player' },
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (linkErr && !linkErr.message.toLowerCase().includes('already')) {
    return { error: `Player added but invite link failed: ${linkErr.message}` }
  }

  if (linkData?.properties?.action_link) {
    const { data: { user: coachUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const coachName = coachUser?.user_metadata?.full_name ?? coachUser?.email ?? 'Your coach'
    await sendPlayerInviteEmail({
      toEmail: playerEmail,
      playerName: playerName || undefined,
      coachName,
      inviteUrl: linkData.properties.action_link,
    })
  }

  revalidatePath('/', 'layout')
  return {
    success: `Invite sent to ${playerEmail}! ${playerName ? `${playerName} will` : 'They will'} receive an email to set up their account.`,
  }
}
