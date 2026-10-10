'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ageGroupIsUnder13, bandFromBirth } from '@/lib/age-band'
import { parentConsentFlowEnabled, UNDER_13_INVITE_REFUSED, UNDER_13_TEAM_REFUSED } from '@/lib/under13-mode'
import { parsePositionsInput, writeWithPositions, POSITIONS_UNAVAILABLE } from '@/lib/positions'
import { ageAnswerFields, writeWithAgeFields } from '@/lib/consent-server'
import { normalizeEmail } from '@/lib/invite-gate'
import { findAuthUserByEmail } from '@/lib/team-coaches'
import { canCoachWriteForPlayer, isCoachOnTeam } from '@/lib/team-access'
import { resendPlayerInvite } from '@/app/actions/invite'
import {
  ATTACH_ALREADY_CLAIMED,
  ATTACH_EMAIL_REQUIRED,
  ATTACH_NOT_AUTHORIZED,
  EMAIL_ALREADY_LINKED,
  EMAIL_SAVED_INVITE_FAILED,
  MINOR_CONSENT_REQUIRED,
  ROSTER_NAME_REQUIRED,
  ROSTER_PLAYER_ADDED,
  parseMinorConsentKind,
  type MinorConsentKind,
} from '@/lib/roster-consent'

export type RosterActionState = { error?: string; success?: string; inviteUrl?: string }

async function emailTakenByOther(email: string, exceptPlayerId?: string): Promise<boolean | 'error'> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('id')
    .eq('email', email)
  if (error) {
    console.error('[roster] email lookup failed', error.message)
    return 'error'
  }
  const rows = (data ?? []) as { id: string }[]
  return rows.some((r) => r.id !== exceptPlayerId)
}

async function recordRosterConsent(
  playerId: string,
  kind: MinorConsentKind,
  coachId: string,
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.from('player_video_consents').insert({
    player_id: playerId,
    kind,
    consent_given_by: coachId,
    guardian_coach_id: kind === 'coach_is_guardian' ? coachId : null,
  })
  if (error) {
    console.error('[addRosterPlayer] consent insert failed', { code: error.code, message: error.message })
    return { error: 'Could not record consent. Please try again.' }
  }
  return {}
}

export async function addRosterPlayer(
  _prevState: RosterActionState | undefined,
  formData: FormData,
): Promise<RosterActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'coach') return { error: 'Only coaches can add players' }

  const playerName = ((formData.get('full_name') as string | null) ?? '').trim()
  const rawEmail = ((formData.get('player_email') as string | null) ?? '').trim()
  const playerEmail = rawEmail ? normalizeEmail(rawEmail) : null
  const teamId = formData.get('team_id') as string | null
  const teamIds = [...new Set((teamId ? [teamId] : (formData.getAll('team_ids') as string[])).filter(Boolean))]

  if (!playerName) return { error: ROSTER_NAME_REQUIRED }

  const birth = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!birth.ok) return { error: birth.error }
  if (birth.band === 'under_13' && !parentConsentFlowEnabled()) return { error: UNDER_13_INVITE_REFUSED }

  const consentKind = parseMinorConsentKind(formData.get('minor_consent'))
  if (birth.band === '13_17' && !consentKind) return { error: MINOR_CONSENT_REQUIRED }

  if (teamIds.length > 0) {
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, age_group')
      .in('id', teamIds)
    if (teamsError) return { error: 'Could not check teams. Please try again.' }
    const found = (teams ?? []) as { id: string; age_group?: string | null }[]
    if (found.length !== teamIds.length) return { error: 'Invalid team' }
    for (const tid of teamIds) {
      if (!(await isCoachOnTeam(user.id, tid))) return { error: 'Invalid team' }
    }
    if (found.some((t) => ageGroupIsUnder13(t.age_group)) && !parentConsentFlowEnabled()) {
      return { error: UNDER_13_TEAM_REFUSED }
    }
  }

  const parsedPositions = parsePositionsInput(formData.getAll('positions'))
  if (!parsedPositions.ok) return { error: parsedPositions.error }

  if (playerEmail) {
    const taken = await emailTakenByOther(playerEmail)
    if (taken === 'error') return { error: 'Could not check this player. Please try again.' }
    if (taken) return { error: EMAIL_ALREADY_LINKED }
    const existingAuth = await findAuthUserByEmail(playerEmail)
    if (existingAuth === 'error') return { error: 'Could not check this player. Please try again.' }
    if (existingAuth) return { error: EMAIL_ALREADY_LINKED }
  }

  const fields = ageAnswerFields('coach', birth.band, user.id, {})
  const { result: { data: player, error: playerError } } = await writeWithAgeFields(
    fields.age,
    fields.adult,
    (ageCols) => writeWithPositions(
      {
        coach_id: user.id,
        full_name: playerName,
        email: playerEmail,
        user_id: null,
        ...ageCols,
      },
      parsedPositions.positions,
      (payload) => supabaseAdmin.from('players').insert(payload).select('id').single(),
    ),
  )

  if (playerError) {
    if (playerError.message === POSITIONS_UNAVAILABLE) return { error: POSITIONS_UNAVAILABLE }
    if (playerError.code === '23505') return { error: EMAIL_ALREADY_LINKED }
    console.error('[addRosterPlayer] player insert failed', { code: playerError.code, message: playerError.message })
    return { error: 'Could not add this player. Please try again.' }
  }

  const playerId = (player as { id?: string } | null)?.id
  if (!playerId) return { error: 'Could not add this player. Please try again.' }

  if (birth.band === '13_17' && consentKind) {
    const consent = await recordRosterConsent(playerId, consentKind, user.id)
    if (consent.error) {
      await supabaseAdmin.from('players').delete().eq('id', playerId).is('user_id', null)
      return { error: consent.error }
    }
  }

  if (teamIds.length > 0) {
    const { error: teamsAssignError } = await supabaseAdmin.from('player_teams').upsert(
      teamIds.map((tid) => ({ player_id: playerId, team_id: tid })),
      { onConflict: 'player_id,team_id', ignoreDuplicates: true },
    )
    if (teamsAssignError) {
      await supabaseAdmin.from('players').delete().eq('id', playerId).is('user_id', null)
      return { error: 'Could not add this player to the team. Please try again.' }
    }
  }

  revalidatePath('/', 'layout')
  return { success: ROSTER_PLAYER_ADDED }
}

export async function attachPlayerEmail(
  _prevState: RosterActionState | undefined,
  formData: FormData,
): Promise<RosterActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const playerId = ((formData.get('player_id') as string | null) ?? '').trim()
  const rawEmail = ((formData.get('player_email') as string | null) ?? '').trim()
  const sendNow = formData.get('send_invite') === 'on' || formData.get('send_invite') === 'true'
  if (!playerId) return { error: 'Player not found' }

  const { data: player, error: readError } = await supabaseAdmin
    .from('players')
    .select('id, user_id, email, accepted_at')
    .eq('id', playerId)
    .maybeSingle()
  if (readError || !player) return { error: 'Player not found' }
  if (!(await canCoachWriteForPlayer(user.id, playerId))) return { error: ATTACH_NOT_AUTHORIZED }
  if (player.user_id) return { error: ATTACH_ALREADY_CLAIMED }

  const playerEmail = normalizeEmail(rawEmail)
  if (!playerEmail) return { error: ATTACH_EMAIL_REQUIRED }

  const taken = await emailTakenByOther(playerEmail, playerId)
  if (taken === 'error') return { error: 'Could not check this email. Please try again.' }
  if (taken) return { error: EMAIL_ALREADY_LINKED }
  const existingAuth = await findAuthUserByEmail(playerEmail)
  if (existingAuth === 'error') return { error: 'Could not check this email. Please try again.' }
  if (existingAuth) return { error: EMAIL_ALREADY_LINKED }

  if (player.email !== playerEmail) {
    const { data: updated, error: writeError } = await supabaseAdmin
      .from('players')
      .update({ email: playerEmail })
      .eq('id', playerId)
      .is('user_id', null)
      .select('id')
    if (writeError) {
      if (writeError.code === '23505') return { error: EMAIL_ALREADY_LINKED }
      console.error('[attachPlayerEmail] update failed', { code: writeError.code, message: writeError.message })
      return { error: 'Could not save this email. Please try again.' }
    }
    if (!Array.isArray(updated) || updated.length !== 1) return { error: 'Could not save this email. Please try again.' }
  }

  if (!sendNow) {
    revalidatePath('/', 'layout')
    return { success: `Email saved as ${playerEmail}.` }
  }

  // players.email is written first so the 042 hook allows generateLink.
  const sent = await resendPlayerInvite(playerId)
  if (sent.error) {
    revalidatePath('/', 'layout')
    return { error: EMAIL_SAVED_INVITE_FAILED, inviteUrl: sent.inviteUrl }
  }
  revalidatePath('/', 'layout')
  return { success: sent.success, inviteUrl: sent.inviteUrl }
}
