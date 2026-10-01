'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']

export async function createTeam(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  const ageGroup = (formData.get('age_group') as string)?.trim()

  if (!name) return { error: 'Team name is required' }
  if (ageGroup && !AGE_GROUPS.includes(ageGroup)) return { error: 'Invalid age group' }

  const { error } = await supabaseAdmin
    .from('teams')
    .insert({ coach_id: user.id, name, age_group: ageGroup || null })

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

// Deletes the team and its links (player_teams, team_coaches) in one database
// call (delete_team, migration 031). Players, their clips and data stay. The
// function checks that the signed-in user owns or coaches the team.
export async function deleteTeam(teamId: string): Promise<{ error?: string; success?: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof teamId !== 'string' || !UUID.test(teamId)) return { error: 'Team not found' }

  // The user's own client, so the function sees auth.uid().
  const { data, error } = await supabase.rpc('delete_team', { p_team_id: teamId })
  if (error) {
    console.error('[deleteTeam] delete_team failed', { code: error.code, message: error.message })
    if (error.code === 'PGRST202' || error.code === '42883') {
      return { error: 'Deleting teams isn\'t available yet (database update pending). The team was not deleted.' }
    }
    return { error: 'Could not delete the team. Nothing was changed. Please try again.' }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { deleted?: boolean } | null | undefined
  if (!row?.deleted) {
    return { error: 'This team was not deleted. It may already be gone, or you are not a coach on it. Refresh the page.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/team/${teamId}`)
  return { success: true }
}
