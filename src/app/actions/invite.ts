'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPlayerInviteEmail } from '@/lib/email'

export async function resendPlayerInvite(
  playerId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('email, full_name, coach_id, accepted_at')
    .eq('id', playerId)
    .single()

  if (!player) return { error: 'Player not found' }
  if (player.coach_id !== user.id) return { error: 'Not authorized' }
  if (player.accepted_at) return { error: 'This player has already joined.' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: player.email,
    options: {
      data: { role: 'player' },
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (linkErr) {
    if (linkErr.message.toLowerCase().includes('already')) {
      return { error: 'This player already has a Release Point AI account and can sign in at releasepointai.com.' }
    }
    return { error: `Couldn't generate invite link: ${linkErr.message}` }
  }

  if (linkData?.properties?.action_link) {
    const { data: { user: coachUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const coachName = coachUser?.user_metadata?.full_name ?? coachUser?.email ?? 'Your coach'
    await sendPlayerInviteEmail({
      toEmail: player.email,
      playerName: player.full_name || undefined,
      coachName,
      inviteUrl: linkData.properties.action_link,
    })
  }

  revalidatePath('/', 'layout')
  return { success: `Invite resent to ${player.email}` }
}

export async function invitePlayer(
  _prevState: { error?: string; success?: string; inviteUrl?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string; inviteUrl?: string }> {
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
  const ageGroup    = ((formData.get('age_group') as string | null) ?? '').trim() || null
  const position    = ((formData.get('position') as string | null) ?? '').trim() || null
  const teamId  = formData.get('team_id') as string | null
  const teamIds = teamId ? [teamId] : (formData.getAll('team_ids') as string[])

  if (!playerEmail) return { error: 'Player email is required' }

  // Create player row
  const { data: player, error: playerError } = await supabaseAdmin
    .from('players')
    .insert({ coach_id: user.id, full_name: playerName, email: playerEmail, age_group: ageGroup, position })
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
        // Unlinked (signed up independently) — claim them for this coach
        await supabaseAdmin.from('players').update({ coach_id: user.id }).eq('id', existing.id)
        playerId = existing.id
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

  if (linkErr) {
    if (!linkErr.message.toLowerCase().includes('already')) {
      return { error: `Player added but invite link failed: ${linkErr.message}` }
    }
    // Player already has a Release Point AI account — they were added to the
    // roster but don't need a new invite. No email sent; return an honest message.
    revalidatePath('/', 'layout')
    return {
      success: `${playerName ? `${playerName} has` : 'Player has'} been added to your roster. They already have a Release Point AI account and can sign in at releasepointai.com to view their clips.`,
    }
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
    inviteUrl: linkData?.properties?.action_link ?? undefined,
  }
}
