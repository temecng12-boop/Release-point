'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isPlayersOwnCoach, pickCoachEditableFields, teamIdsNotOwned } from '@/lib/auth/roster-access'

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `avatars/${user.id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('clips')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadErr) return { error: uploadErr.message }

  const { data: signed } = await supabaseAdmin.storage
    .from('clips')
    .createSignedUrl(path, 315_360_000) // ~10 years

  if (!signed?.signedUrl) return { error: 'Could not generate avatar URL' }

  const { error: profileError } = await supabaseAdmin.from('profiles').update({ avatar_url: signed.signedUrl }).eq('id', user.id)
  if (profileError) return { error: 'Photo uploaded, but it couldn\'t be saved to your profile. Please try again.' }
  revalidatePath('/profile')
  return { success: true, avatarUrl: signed.signedUrl }
}

function toTitleCase(s: string) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

export async function updatePlayer(playerId: string, data: {
  full_name?: string
  age_group?: string
  position?: string
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

  if (Object.keys(fields).length > 0) {
    const { error } = await supabaseAdmin
      .from('players')
      .update(fields)
      .eq('id', playerId)
      .eq('coach_id', user.id)

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

export async function deletePlayer(playerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin
    .from('players')
    .delete()
    .eq('id', playerId)
    .eq('coach_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function savePlayerPosition(position: 'pitcher' | 'hitter') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin
    .from('players')
    .update({ position })
    .eq('user_id', user.id)

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
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (data.full_name) data.full_name = toTitleCase(data.full_name)

  const { error } = await supabaseAdmin
    .from('players')
    .update(data)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
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

  const { error } = await supabaseAdmin.from('players').update(data).eq('id', playerId)
  if (error) return { error: error.message }

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

  const { schools, ...rest } = data

  // Store schools array as JSON in the existing `college` text column
  const payload: Record<string, unknown> = { ...rest }
  if (schools !== undefined) {
    payload.college = schools.length > 0 ? JSON.stringify(schools) : null
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  return { success: true }
}
