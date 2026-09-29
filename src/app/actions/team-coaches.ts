'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function addCoachToTeam(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const teamId = formData.get('team_id') as string
  const email = (formData.get('coach_email') as string)?.trim().toLowerCase()
  if (!teamId || !email) return { error: 'Team and email are required' }

  // Verify the caller is the team organizer
  const { data: membership } = await supabase
    .from('team_coaches')
    .select('role')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .single()

  if (!membership || membership.role !== 'organizer') {
    return { error: 'Only the team organizer can add coaches' }
  }

  // Look up the invited coach by email
  const { data: { users }, error: lookupErr } = await supabaseAdmin.auth.admin.listUsers()
  if (lookupErr) return { error: 'Could not look up user' }

  const target = users.find((u: { email?: string | null; id: string }) => u.email?.toLowerCase() === email)
  if (!target) return { error: 'No Release Point account found for that email' }
  if (target.id === user.id) return { error: "That's your own email" }

  // Verify target is a coach
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', target.id)
    .single()

  if (!targetProfile || targetProfile.role !== 'coach') {
    return { error: 'That email belongs to a player account, not a coach' }
  }

  // Add to team_coaches
  const { error: insertErr } = await supabase
    .from('team_coaches')
    .insert({ team_id: teamId, coach_id: target.id, role: 'assistant' })

  if (insertErr) {
    if (insertErr.code === '23505') return { error: 'That coach is already on this team' }
    return { error: insertErr.message }
  }

  revalidatePath(`/dashboard/team/${teamId}`)
  return { success: `${targetProfile.full_name ?? email} added as assistant coach` }
}

export async function removeCoachFromTeam(teamId: string, coachId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Can't remove yourself if you're the organizer
  const { data: myRole } = await supabase
    .from('team_coaches')
    .select('role')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .single()

  if (!myRole || myRole.role !== 'organizer') {
    return { error: 'Only the team organizer can remove coaches' }
  }

  if (coachId === user.id) return { error: 'The organizer cannot be removed' }

  const { error } = await supabase
    .from('team_coaches')
    .delete()
    .eq('team_id', teamId)
    .eq('coach_id', coachId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/team/${teamId}`)
  return {}
}
