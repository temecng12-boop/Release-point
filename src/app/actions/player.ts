'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isPlayersOwnCoach, pickCoachEditableFields, teamIdsNotOwned } from '@/lib/auth/roster-access'
import { setCoachAgeBand } from '@/lib/consent-server'
import { isAgeBand } from '@/lib/age-band'
import { collectStorageFiles, removeStorageFiles } from '@/lib/account-deletion'
import { supabaseDeletionStorage } from '@/lib/account-deletion-supabase'
import { AVATAR_BUCKET, avatarPathFor, signAvatarUrl } from '@/lib/avatar'
import { pickFields, OWN_PROFILE_FIELDS, ATHLETE_PROFILE_FIELDS, PLAYER_SELF_FIELDS } from '@/lib/action-fields'
import { parsePositionsInput, writeWithPositions, POSITIONS_UNAVAILABLE, type PlayerPosition } from '@/lib/positions'
import { describeDbError } from '@/lib/db-errors'
import { avatarFileProblem, avatarBytesMatchType, AVATAR_TOO_BIG, AVATAR_NOT_IMAGE, MAX_AVATAR_BYTES } from '@/lib/avatar-rules'

/**
 * Saves the photo at clips/avatars/<userId>.<ext> (private bucket) and stores that path in
 * profiles.avatar_url (the only place avatar_url is written; updateProfile's allowlist excludes it).
 * JPEG/PNG/WebP only, at most 2 MB, bytes must match the type, and the extension comes from the
 * type (src/lib/avatar-rules.ts, also checked in the browser before upload). Returns a short-lived signed URL for immediate display.
 * Result: { error } when nothing usable was saved; { success, avatarUrl } on success, where avatarUrl
 * is null (with a notice) if the photo saved but a display URL couldn't be made right now.
 */
export async function uploadAvatar(formData: FormData): Promise<{ error: string } | { success: true; avatarUrl: string | null; notice?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again to change your photo.' }

  const file = formData.get('file')
  if (!file || typeof file === 'string') return { error: 'No photo was received. Please try again.' }
  // Same rule as the browser: JPEG/PNG/WebP, at most 2 MB, and the bytes must
  // match the type. The file name is ignored; the extension comes from the type.
  const problem = avatarFileProblem(file)
  if (problem) return { error: problem }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length > MAX_AVATAR_BYTES) return { error: AVATAR_TOO_BIG }
  if (!avatarBytesMatchType(buffer, file.type)) return { error: AVATAR_NOT_IMAGE }

  const path = avatarPathFor(user.id, file.type)
  if (!path) { console.error('[uploadAvatar] no avatar path for user', user.id); return { error: 'Couldn\'t upload your photo. Please try again.' } }
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadErr) {
    console.error('[uploadAvatar] upload failed', user.id, uploadErr.message)
    return { error: 'Couldn\'t upload your photo. Please try again.' }
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').update({ avatar_url: path }).eq('id', user.id)
  if (profileError) return { error: 'Photo uploaded, but it couldn\'t be saved to your profile. Please try again.' }
  revalidatePath('/profile')
  revalidatePath('/player-settings')

  const avatarUrl = await signAvatarUrl(supabaseAdmin.storage, path, user.id)
  if (!avatarUrl) return { success: true, avatarUrl: null, notice: 'Photo saved. Refresh the page to see it.' }
  return { success: true, avatarUrl }
}

function toTitleCase(s: string) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

export async function updatePlayer(playerId: string, data: {
  full_name?: string
  age_group?: string
  position?: string
  positions?: string[]
  teamIds?: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only the player's own coach may change anything, including team links.
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!isPlayersOwnCoach(user.id, player)) return { error: 'Not authorized' }

  // Server action arguments come from the client: keep only the editable
  // fields, and only team ids for teams this coach owns.
  const fields = pickCoachEditableFields((data ?? {}) as Record<string, unknown>)
  const teamIds = Array.isArray(data?.teamIds)
    ? data.teamIds.filter((t): t is string => typeof t === 'string')
    : undefined

  let ownedTeamIds: string[] = []
  if (teamIds !== undefined) {
    const { data: ownedTeams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('coach_id', user.id)
    if (teamsError) return { error: teamsError.message }
    ownedTeamIds = (ownedTeams ?? []).map((t) => t.id as string)
    if (teamIdsNotOwned(teamIds, ownedTeamIds).length > 0) return { error: 'Invalid team' }
  }

  if (fields.full_name) fields.full_name = toTitleCase(fields.full_name)

  let positions: PlayerPosition[] | undefined
  if (data?.positions !== undefined) {
    const parsed = parsePositionsInput(data.positions)
    if (!parsed.ok) return { error: parsed.error }
    positions = parsed.positions
  }

  if (Object.keys(fields).length > 0 || positions !== undefined) {
    const { error } = await writeWithPositions(fields, positions, (payload) =>
      supabaseAdmin.from('players').update(payload).eq('id', playerId).eq('coach_id', user.id),
    )
    if (error) return { error: error.message }
  }

  // Sync team assignments, limited to this coach's own teams.
  // A failure here is reported, not swallowed (the player's other fields are
  // already saved by then).
  if (teamIds !== undefined && ownedTeamIds.length > 0) {
    const { error: unlinkError } = await supabaseAdmin
      .from('player_teams')
      .delete()
      .eq('player_id', playerId)
      .in('team_id', ownedTeamIds)
    if (unlinkError) {
      console.error('[updatePlayer] team unlink failed', { code: unlinkError.code, message: unlinkError.message })
      revalidatePath('/dashboard')
      return { error: 'Player details saved, but team changes couldn\'t be saved. Please try again.' }
    }
    if (teamIds.length > 0) {
      const { error: linkError } = await supabaseAdmin.from('player_teams').insert(
        teamIds.map((tid) => ({ player_id: playerId, team_id: tid }))
      )
      if (linkError) {
        console.error('[updatePlayer] team link failed', { code: linkError.code, message: linkError.message })
        revalidatePath('/dashboard')
        return { error: 'Player details saved, but team changes couldn\'t be saved. Please try again.' }
      }
    }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

// The player's coach gives their age answer (under 13, 13 to 17, 18+), or
// clears it (null). Optional, from Edit Player only. The stored band is the younger of the coach's and the
// player's answers and any under-13 age group (037). Authorization is checked
// in setCoachAgeBand (players.coach_id = caller); written with the service
// role because 037 refuses these columns from end users.
export async function setPlayerAgeBand(playerId: string, band: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof playerId !== 'string' || !playerId) return { error: 'Invalid player' }
  if (band !== null && !isAgeBand(band)) return { error: 'Choose an age band.' }

  const result = await setCoachAgeBand(supabaseAdmin, user.id, playerId, band)
  if ('error' in result) return { error: result.error }

  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/profile/${playerId}`)
  return { success: true as const, band: result.band, youngerKept: result.youngerKept === true }
}

export async function deletePlayer(playerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only the player's own coach. The linked account's avatar and profile are
  // never touched here (account deletion handles those).
  const { data: player, error: readError } = await supabaseAdmin
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('coach_id', user.id)
    .maybeSingle()
  if (readError) {
    console.error('[deletePlayer] reading the player failed', { playerId, error: readError.message })
    return { error: 'Could not remove this player. Please try again.' }
  }
  if (!player) return { error: 'Player not found' }

  // Collect the player's files first: clips/<playerId>/… (videos, voice notes)
  // and lessons/<playerId>/…. A listing failure stops here, before anything is
  // deleted.
  const storage = supabaseDeletionStorage(supabaseAdmin)
  let files
  try {
    files = await collectStorageFiles(
      storage,
      [{ bucket: 'clips', path: playerId }, { bucket: 'lessons', path: playerId }],
      [],
      [],
    )
  } catch (e) {
    console.error('[deletePlayer] listing files failed', { playerId, error: e instanceof Error ? e.message : String(e) })
    return { error: 'Could not remove this player. Please try again.' }
  }

  const { data: deleted, error } = await supabaseAdmin
    .from('players')
    .delete()
    .eq('id', playerId)
    .eq('coach_id', user.id)
    .select('id')

  if (error) {
    console.error('[deletePlayer] deleting the player failed', { playerId, error: error.message })
    return { error: 'Could not remove this player. Please try again.' }
  }
  if (!deleted || deleted.length !== 1) return { error: 'Player not found' }

  // Rows are gone; remove the files. A failure doesn't undo the delete: the
  // leftover paths are logged for cleanup and the coach gets a warning.
  const { leftover } = await removeStorageFiles(storage, files)
  revalidatePath('/', 'layout')
  if (leftover.length > 0) {
    console.error('[deletePlayer] storage files left after delete', { playerId, leftoverFiles: leftover })
    return { success: true, warning: 'Player removed, but some of their files couldn\'t be deleted.' }
  }
  return { success: true }
}

export async function savePlayerPosition(position: PlayerPosition[] | 'pitcher' | 'hitter') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = parsePositionsInput(Array.isArray(position) ? position : [position])
  if (!parsed.ok) return { error: parsed.error }

  const { error } = await writeWithPositions({}, parsed.positions, (payload) =>
    supabaseAdmin.from('players').update(payload).eq('user_id', user.id),
  )

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updatePlayerSelfProfile(data: {
  full_name?: string
  height?: string
  weight?: string
  high_school?: string
  travel_team?: string
  graduation_year?: number | null
  throws?: string
  bats?: string
  college_interests?: string[]
  college_offers?: string[]
  showcases?: { name: string; date: string; location: string }[]
  career_stats?: Record<string, string>
  positions?: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only the player's own profile columns; never coach, guardian, consent or 18+ columns.
  const picked = pickFields(data, PLAYER_SELF_FIELDS)
  if (!picked.ok) return { error: picked.error }
  const fields = picked.fields
  if (typeof fields.full_name === 'string' && fields.full_name) fields.full_name = toTitleCase(fields.full_name)

  let positions: PlayerPosition[] | undefined
  if ((data as { positions?: unknown } | null)?.positions !== undefined) {
    const parsed = parsePositionsInput((data as { positions?: unknown }).positions)
    if (!parsed.ok) return { error: parsed.error }
    positions = parsed.positions
  }
  if (Object.keys(fields).length === 0 && positions === undefined) return { success: true }

  const { data: changed, error } = await writeWithPositions(fields, positions, (payload) =>
    supabaseAdmin.from('players').update(payload).eq('user_id', user.id).select('id'),
  )

  if (error) {
    if (error.message === POSITIONS_UNAVAILABLE) return { error: POSITIONS_UNAVAILABLE }
    return { error: describeDbError('updatePlayerSelfProfile', error, 'Couldn\'t save your profile.') }
  }
  if (!changed || changed.length === 0) return { error: 'Couldn\'t find your player profile. Please refresh and try again.' }
  revalidatePath('/dashboard')
  revalidatePath('/player-settings')
  return { success: true }
}

export async function updatePlayerAthleteProfile(playerId: string, data: {
  college_interests?: string[]
  college_offers?: string[]
  showcases?: { name: string; date: string; location: string }[]
  career_stats?: Record<string, string>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Allow coach of this player OR the player themselves
  const { data: player } = await supabaseAdmin.from('players').select('coach_id, user_id').eq('id', playerId).single()
  if (!player) return { error: 'Player not found' }
  if (player.coach_id !== user.id && player.user_id !== user.id) return { error: 'Not authorized' }

  const picked = pickFields(data, ATHLETE_PROFILE_FIELDS)
  if (!picked.ok) return { error: picked.error }
  if (Object.keys(picked.fields).length === 0) return { success: true }
  const { error } = await supabaseAdmin.from('players').update(picked.fields).eq('id', playerId)
  if (error) return { error: describeDbError('updatePlayerAthleteProfile', error, 'Couldn\'t save the profile.') }

  revalidatePath(`/profile/${playerId}`)
  revalidatePath('/player-settings')
  return { success: true }
}

export async function updateProfile(data: {
  full_name?: string
  team_name?: string
  bio?: string
  schools?: string[]
  playing_career?: string
  coaching_since?: number | null
  certifications?: string[]
  location?: string
  social_twitter?: string
  social_instagram?: string
  social_linkedin?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only the profile's own text columns: never role, avatar_url or id.
  const picked = pickFields(data, OWN_PROFILE_FIELDS)
  if (!picked.ok) return { error: picked.error }
  const payload: Record<string, unknown> = picked.fields
  // Store schools array as JSON in the existing `college` text column
  const schools = (data as { schools?: unknown } | null)?.schools
  if (schools !== undefined) {
    if (!Array.isArray(schools) || !schools.every(x => typeof x === 'string')) return { error: 'Some of these details couldn\'t be saved. Check the fields and try again.' }
    payload.college = schools.length > 0 ? JSON.stringify(schools) : null
  }
  if (Object.keys(payload).length === 0) return { success: true }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', user.id)

  if (error) return { error: describeDbError('updateProfile', error, 'Couldn\'t save your profile.') }
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  return { success: true }
}
