'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

  await supabaseAdmin.from('profiles').update({ avatar_url: signed.signedUrl }).eq('id', user.id)
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

  const { teamIds, ...fields } = data

  if (fields.full_name) fields.full_name = toTitleCase(fields.full_name)

  const { error } = await supabaseAdmin
    .from('players')
    .update(fields)
    .eq('id', playerId)
    .eq('coach_id', user.id)

  if (error) return { error: error.message }

  // Sync team assignments
  if (teamIds !== undefined) {
    await supabaseAdmin.from('player_teams').delete().eq('player_id', playerId)
    if (teamIds.length > 0) {
      await supabaseAdmin.from('player_teams').insert(
        teamIds.map((tid) => ({ player_id: playerId, team_id: tid }))
      )
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
  college?: string
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

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(data)
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  return { success: true }
}
