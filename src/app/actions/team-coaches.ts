'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/team-coaches'

// The caller's role on a team, read with the service client for the
// authenticated user's id. 'unavailable' if team_coaches can't be read
// (e.g. migration 018 not applied).
async function myTeamRole(teamId: string, userId: string): Promise<string | null | 'unavailable'> {
  const { data, error } = await supabaseAdmin
    .from('team_coaches')
    .select('role')
    .eq('team_id', teamId)
    .eq('coach_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[team-coaches] membership lookup failed', { code: error.code, message: error.message })
    return 'unavailable'
  }
  return (data?.role as string | undefined) ?? null
}

const UNAVAILABLE = 'Team coaches aren\'t available yet (database update pending). Please try again later.'

export async function addCoachToTeam(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const teamId = (formData.get('team_id') as string | null)?.trim()
  const email = (formData.get('coach_email') as string | null)?.trim().toLowerCase()
  if (!teamId || !email) return { error: 'Team and email are required' }

  // Only the team organizer can add coaches.
  const role = await myTeamRole(teamId, user.id)
  if (role === 'unavailable') return { error: UNAVAILABLE }
  if (role !== 'organizer') return { error: 'Only the team organizer can add coaches' }

  // Look up the invited coach on the server (service client), after the organizer check.
  const target = await findAuthUserByEmail(email)
  if (target === 'error') return { error: 'Could not look up that email. Please try again.' }
  if (!target) return { error: 'No Release Point account found for that email' }
  if (target.id === user.id) return { error: "That's your own email" }

  const { data: targetProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name')
    .eq('id', target.id)
    .maybeSingle()
  if (profileError) {
    console.error('[addCoachToTeam] profile lookup failed', { code: profileError.code, message: profileError.message })
    return { error: 'Could not look up that account. Please try again.' }
  }
  if (!targetProfile) return { error: 'That account hasn\'t finished setting up yet' }
  if (targetProfile.role !== 'coach') return { error: 'That email belongs to a player or parent account, not a coach' }

  const { error: insertErr } = await supabaseAdmin
    .from('team_coaches')
    .insert({ team_id: teamId, coach_id: target.id, role: 'assistant' })

  if (insertErr) {
    if (insertErr.code === '23505') return { error: 'That coach is already on this team' }
    console.error('[addCoachToTeam] insert failed', { code: insertErr.code, message: insertErr.message })
    return { error: 'Could not add that coach. Please try again.' }
  }

  revalidatePath(`/dashboard/team/${teamId}`)
  return { success: `${targetProfile.full_name ?? email} added as assistant coach` }
}

export async function removeCoachFromTeam(teamId: string, coachId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const role = await myTeamRole(teamId, user.id)
  if (role === 'unavailable') return { error: UNAVAILABLE }
  if (role !== 'organizer') return { error: 'Only the team organizer can remove coaches' }
  if (coachId === user.id) return { error: 'The organizer cannot be removed' }

  const { error } = await supabaseAdmin
    .from('team_coaches')
    .delete()
    .eq('team_id', teamId)
    .eq('coach_id', coachId)
    .neq('role', 'organizer')

  if (error) {
    console.error('[removeCoachFromTeam] delete failed', { code: error.code, message: error.message })
    return { error: 'Could not remove that coach. Please try again.' }
  }

  revalidatePath(`/dashboard/team/${teamId}`)
  return {}
}
