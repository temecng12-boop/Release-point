'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ageBandFields, isMissingAgeBandColumn, isMissingConsentColumn, writeWithAgeFields } from '@/lib/consent-server'
import { isAgeBand, type AgeBand } from '@/lib/consent'
import { isValidEmail, normalizeEmail } from '@/lib/guardian-email'
import { GUARDIAN_ONLY_UNDER_13 } from '@/lib/guardian-invite'
import { saveGuardianForPlayer } from './guardian'
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

  // Age band is captured once, here (RP-041, 035): under 13, 13 to 17, or 18+.
  // '18_plus' also records the coach's 18+ confirmation (023's columns).
  // The older form's age_status=adult still means 18+.
  const rawBand = formData.get('age_band') ?? (formData.get('age_status') === 'adult' ? '18_plus' : null)
  if (!isAgeBand(rawBand)) {
    return { error: 'Choose the player\'s age: under 13, 13 to 17, or 18 or older.' }
  }
  const band: AgeBand = rawBand
  const { age: ageFields, adult: adultFields } = ageBandFields(band, user.id)
  const adultOnly = band === '18_plus' ? adultFields : {}

  // Optional parent or guardian for a player under 13 (emailed after the invite).
  const guardianEmail = normalizeEmail(formData.get('guardian_email'))
  const guardianName = ((formData.get('guardian_name') as string | null) ?? '').trim()
  if (guardianEmail && band !== 'under_13') return { error: GUARDIAN_ONLY_UNDER_13 }
  if (guardianEmail && !isValidEmail(guardianEmail)) return { error: 'Enter a valid email address for the parent or guardian.' }
  if (guardianEmail && guardianEmail === playerEmail) return { error: 'Use the parent or guardian\'s own email, not the player\'s.' }

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
  const { result: { data: player, error: playerError }, bandSaved } = await writeWithAgeFields(
    ageFields,
    adultOnly,
    (fields) => supabaseAdmin
      .from('players')
      .insert({ coach_id: user.id, full_name: playerName, email: playerEmail, ...fields })
      .select('id')
      .single(),
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

  // Existing player now on this coach's roster: record the chosen band only if
  // no age is on file yet (an existing band or 18+ confirmation is never
  // overwritten from here; Edit Player changes it).
  if (playerError?.code === '23505' && playerId) {
    const { error: ageError } = await supabaseAdmin
      .from('players')
      .update({ ...ageFields, ...adultOnly })
      .eq('id', playerId)
      .eq('coach_id', user.id)
      .is('age_band', null)
      .is('adult_confirmed_at', null)
    if (isMissingAgeBandColumn(ageError) || isMissingConsentColumn(ageError)) {
      // Before 035 (or 023): as before, only an 18+ confirmation is recorded.
      if (band === '18_plus' && !isMissingConsentColumn(ageError)) {
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
    } else if (ageError) {
      console.error('[invitePlayer] could not record age band', playerId, ageError.message)
      return { error: band === '18_plus'
        ? 'This player is on your roster, but the 18+ confirmation could not be saved. Please try again.'
        : 'This player is on your roster, but their age could not be saved. Please try again.' }
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
    return withGuardian(playerId, guardianEmail, guardianName, { success: existingAccountMessage(playerEmail, alreadyOnRoster, teamIds.length) })
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
  const bandNote = !bandSaved && band !== '18_plus' && !alreadyOnRoster
    ? ` Their age couldn't be recorded yet (a database update is pending), so video can't be added until it is.`
    : ''
  const bandText = band === '18_plus'
    ? `${who} is marked 18+.`
    : band === '13_17'
      ? `${who} is marked 13 to 17.`
      : `${who} is marked under 13: video can't be added until a parent or guardian gives consent.`
  return withGuardian(playerId, guardianEmail, guardianName, { success: `Invite sent to ${playerEmail}. ${bandText}${bandNote}` })
}

/** After the player invite: attach and email the optional under-13 guardian. */
async function withGuardian(
  playerId: string,
  guardianEmail: string,
  guardianName: string,
  result: { success: string },
): Promise<{ success?: string; error?: string }> {
  if (!guardianEmail) return result
  const saved = await saveGuardianForPlayer(playerId, { email: guardianEmail, full_name: guardianName })
  if ('error' in saved) return { error: `${result.success} ${saved.error}` }
  return { success: `${result.success} ${saved.success}` }
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
