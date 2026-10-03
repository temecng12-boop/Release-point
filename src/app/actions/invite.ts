'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isMissingConsentColumn, writeWithAdultFields } from '@/lib/consent-server'
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

  // Age status is captured once, here (RP-041). 'adult' records the coach's
  // 18+ confirmation; 'minor' leaves the player pending guardian consent.
  const ageStatus = formData.get('age_status')
  if (ageStatus !== 'adult' && ageStatus !== 'minor') {
    return { error: 'Choose whether the player is 18 or older, or under 18.' }
  }
  const adultFields = ageStatus === 'adult'
    ? { adult_confirmed_at: new Date().toISOString(), adult_confirmed_by: user.id }
    : {}

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
  // Before migration 023 the adult columns don't exist; the player is then
  // added without them (see writeWithAdultFields).
  const { data: player, error: playerError } = await writeWithAdultFields(
    adultFields,
    (fields) => supabaseAdmin
      .from('players')
      .insert({ coach_id: user.id, full_name: playerName, email: playerEmail, ...fields })
      .select('id')
      .single(),
  )

  if (playerError && playerError.code !== '23505') return { error: playerError.message }

  // Resolve player id — either newly inserted or existing (on duplicate key)
  let playerId = player?.id ?? null
  let alreadyOnRoster = false
  if (playerError?.code === '23505') {
    // Player with this email already exists — could be unlinked or another coach's player
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('players')
      .select('id, coach_id')
      .eq('email', playerEmail)
      .maybeSingle()
    if (existingError || !existing) return { error: 'Could not check this player. Please try again.' }

    if (existing) {
      if (!existing.coach_id) {
        // Signed up on their own with no coach. Knowing their email is not
        // enough to attach them to a roster, so refuse rather than claim them.
        return { error: SELF_SIGNED_UP_PLAYER_MESSAGE }
      } else if (existing.coach_id === user.id) {
        playerId = existing.id
        alreadyOnRoster = true
      } else {
        return { error: 'This player is already linked to another coach.' }
      }
    }
  }

  // Existing player now on this coach's roster: record the 18+ confirmation if
  // it isn't already on file. (A 'minor' choice never clears an existing one.)
  // Skipped quietly before migration 023 (no adult columns yet).
  if (playerError?.code === '23505' && playerId && ageStatus === 'adult') {
    const { error: adultError } = await supabaseAdmin
      .from('players')
      .update(adultFields)
      .eq('id', playerId)
      .eq('coach_id', user.id)
      .is('adult_confirmed_at', null)
    if (adultError && !isMissingConsentColumn(adultError)) {
      console.error('[invitePlayer] could not record 18+ confirmation', playerId, adultError.message)
      return { error: 'This player is on your roster, but the 18+ confirmation could not be saved. Please try again.' }
    }
  }

  // Assign teams via junction table (new assignments only, ignore duplicates)
  if (!playerId) return { error: 'Could not add this player. Please try again.' }
  if (teamIds.length > 0) {
    const { error: teamsAssignError } = await supabaseAdmin.from('player_teams').upsert(
      teamIds.map((tid) => ({ player_id: playerId, team_id: tid })),
      { onConflict: 'player_id,team_id', ignoreDuplicates: true }
    )
    if (teamsAssignError) return { error: `${addedBut(playerEmail, alreadyOnRoster)} they could not be added to the team. Please try again.` }
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

  // QA-016: Supabase refuses an invite link for an email that already has an
  // account. No setup email is sent then, so the message must not promise one.
  const hasAccount = !!linkErr && (linkErr.code === 'email_exists' || linkErr.message.toLowerCase().includes('already'))
  if (linkErr && !hasAccount) {
    return { error: `${addedBut(playerEmail, alreadyOnRoster)} the invite link failed: ${linkErr.message}` }
  }

  if (hasAccount) {
    revalidatePath('/', 'layout')
    return { success: existingAccountMessage(playerEmail, alreadyOnRoster, teamIds.length) }
  }

  const inviteUrl = linkData?.properties?.action_link
  if (!inviteUrl) return { error: `${addedBut(playerEmail, alreadyOnRoster)} the invite email could not be created. Please try again.` }
  const { data: { user: coachUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
  const coachName = coachUser?.user_metadata?.full_name ?? coachUser?.email ?? 'Your coach'
  // TODO(Compliance): guardian email wording. This invite goes to the address
  // the coach entered, which may be a guardian's. Wording is in
  // sendPlayerInviteEmail (src/lib/email.ts).
  let sent: { error?: string }
  try {
    sent = await sendPlayerInviteEmail({
      toEmail: playerEmail,
      playerName: playerName || undefined,
      coachName,
      inviteUrl,
    })
  } catch (err) {
    sent = { error: err instanceof Error ? err.message : 'unknown error' }
  }
  revalidatePath('/', 'layout')
  if (sent.error) {
    console.error('[invite] invite email not sent', sent.error)
    return { error: `${addedBut(playerEmail, alreadyOnRoster)} the invite email could not be sent (${sent.error}). Please try again.` }
  }

  const who = playerName || 'The player'
  return {
    success: ageStatus === 'adult'
      ? `Invite sent to ${playerEmail}. ${who} is marked 18+.`
      : `Invite sent to ${playerEmail}. ${who} is marked under 18: video can't be added until guardian consent is on file.`,
  }
}

/** Start of a partial-failure message: "Player added, but" or, for a player already on the roster, says so. */
function addedBut(email: string, alreadyOnRoster: boolean): string {
  return alreadyOnRoster ? `${email} is already on your roster, but` : 'Player added, but'
}

/** Success text when the email already has an account (no email is sent). */
function existingAccountMessage(email: string, alreadyOnRoster: boolean, teamCount: number): string {
  const s = teamCount === 1 ? '' : 's'
  if (alreadyOnRoster) {
    return teamCount > 0
      ? `${email} already has an account and is already on your roster. They've been added to the selected team${s} and will see it next time they sign in. No email was sent.`
      : `${email} already has an account and is already on your roster. No email was sent.`
  }
  const teams = teamCount > 0 ? ` and to the selected team${s}` : ''
  return `${email} already has an account and has been added to your roster${teams}. No email was sent; they'll see it next time they sign in.`
}
