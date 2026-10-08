'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ageGroupIsUnder13, bandFromBirth } from '@/lib/age-band'
import { parentConsentFlowEnabled, UNDER_13_INVITE_REFUSED, UNDER_13_TEAM_REFUSED } from '@/lib/under13-mode'
import { sendPlayerInviteEmail } from '@/lib/email'
import { buildInviteAcceptUrl } from '@/lib/invite-accept-link'
import { SELF_SIGNED_UP_PLAYER_MESSAGE, teamIdsNotOwned } from '@/lib/auth/roster-access'
import { parsePositionsInput, writeWithPositions } from '@/lib/positions'

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
  const teamId  = formData.get('team_id') as string | null
  const teamIds = [...new Set((teamId ? [teamId] : (formData.getAll('team_ids') as string[])).filter(Boolean))]

  if (!playerEmail) return { error: 'Player email is required' }

  // The coach states the player's birth month and year (required); the band
  // is worked out here and the month/year are never stored. Under 13 (hard
  // stop): refused before anything is read further or written — no player
  // row, no team link, no invite link, no email. 13 or older: the row is
  // created with no band, and the player confirms their age once when they
  // accept the invite (the one screen).
  const birth = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!birth.ok) return { error: birth.error }
  if (birth.band === 'under_13' && !parentConsentFlowEnabled()) return { error: UNDER_13_INVITE_REFUSED }

  // The player's own confirmation (birth month/year screen) when they accept
  // the invite is the age that counts; the coach can also set a band,
  // optionally, in Edit Player, and the younger answer wins (037). A team
  // with an under-13 age group ("U12", "Youth 10-12") can't take new players
  // yet (hard stop, src/lib/under13-mode.ts).
  if (teamIds.length > 0) {
    const { data: ownedTeams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, age_group')
      .eq('coach_id', user.id)
      .in('id', teamIds)
    if (teamsError) return { error: 'Could not check teams. Please try again.' }
    const owned = (ownedTeams ?? []) as { id: string; age_group?: string | null }[]
    if (teamIdsNotOwned(teamIds, owned.map((t) => t.id)).length > 0) return { error: 'Invalid team' }
    if (owned.some((t) => ageGroupIsUnder13(t.age_group)) && !parentConsentFlowEnabled()) return { error: UNDER_13_TEAM_REFUSED }
  }

  const parsedPositions = parsePositionsInput(formData.getAll('positions'))
  if (!parsedPositions.ok) return { error: parsedPositions.error }

  // Create player row. Positions are optional; zero chips is valid.
  const { data: player, error: playerError } = await writeWithPositions(
    { coach_id: user.id, full_name: playerName, email: playerEmail },
    parsedPositions.positions,
    (payload) => supabaseAdmin.from('players').insert(payload).select('id').single(),
  )

  if (playerError && playerError.code !== '23505') {
    console.error('[invitePlayer] player insert failed', { code: playerError.code, message: playerError.message })
    return { error: 'Could not add this player. Please try again.' }
  }

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
    console.error('[invitePlayer] invite link failed', { code: linkErr.code, message: linkErr.message })
    return { error: `${addedBut(playerEmail, alreadyOnRoster)} the invite link could not be created. Please try again.` }
  }

  if (hasAccount) {
    revalidatePath('/', 'layout')
    return { success: existingAccountMessage(playerEmail, alreadyOnRoster, teamIds.length) }
  }

  const inviteUrl = linkData?.properties?.hashed_token
    ? buildInviteAcceptUrl(siteUrl, linkData.properties.hashed_token, '/onboarding')
    : undefined
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
    // The sign-in link is still valid: hand it back so the coach can copy
    // and text it to the player instead of depending on email delivery.
    return { error: `${addedBut(playerEmail, alreadyOnRoster)} the invite email could not be sent (${sent.error}). Please try again.`, inviteUrl }
  }

  return { success: `Invite sent to ${playerEmail}. They'll confirm their age when they set up their account.`, inviteUrl }
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
