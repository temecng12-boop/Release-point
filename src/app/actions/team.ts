'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { blockedLine } from '@/lib/team-delete-copy'

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

const NOT_AVAILABLE = 'Deleting teams isn\'t available yet (database update pending). The team was not deleted.'
const isMissingFunction = (code: string | undefined) => code === 'PGRST202' || code === '42883'

export type TeamDeletePreview = { playersLosingAccess: number; playersWithoutCoach: number }

// Read-only counts for the confirm dialog (team_delete_preview, migration 030):
// players some coach sees only through this team, and players who would be
// left with no coach (the delete is refused while that is above 0).
export async function getTeamDeletePreview(teamId: string): Promise<{ error?: string; preview?: TeamDeletePreview }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof teamId !== 'string' || !UUID.test(teamId)) return { error: 'Team not found' }

  const { data, error } = await supabase.rpc('team_delete_preview', { p_team_id: teamId })
  if (error) {
    console.error('[getTeamDeletePreview] team_delete_preview failed', { code: error.code, message: error.message })
    if (isMissingFunction(error.code)) return { error: NOT_AVAILABLE }
    return { error: 'Could not check this team\'s players. Please try again.' }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed?: boolean; players_losing_access?: number | null; players_without_coach?: number | null } | null | undefined
  if (!row?.allowed || typeof row.players_losing_access !== 'number' || typeof row.players_without_coach !== 'number') {
    return { error: 'This team can\'t be deleted. It may already be gone, or you are not a coach on it. Refresh the page.' }
  }
  return { preview: { playersLosingAccess: row.players_losing_access, playersWithoutCoach: row.players_without_coach } }
}

// Deletes the team and its links (player_teams, team_coaches) in one database
// call (delete_team, migration 030). Players, their clips and data stay. The
// function checks that the signed-in user owns or coaches the team, and
// refuses (blocked) if a player would be left with no coach.
export async function deleteTeam(teamId: string): Promise<{ error?: string; blocked?: number; success?: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof teamId !== 'string' || !UUID.test(teamId)) return { error: 'Team not found' }

  // The user's own client, so the function sees auth.uid().
  const { data, error } = await supabase.rpc('delete_team', { p_team_id: teamId })
  if (error) {
    console.error('[deleteTeam] delete_team failed', { code: error.code, message: error.message })
    if (isMissingFunction(error.code)) return { error: NOT_AVAILABLE }
    return { error: 'Could not delete the team. Nothing was changed. Please try again.' }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    { deleted?: boolean; blocked?: boolean; players_without_coach?: number | null } | null | undefined
  if (row?.blocked) {
    const n = row.players_without_coach ?? 0
    return { error: `The team was not deleted. ${blockedLine(n)}`, blocked: n }
  }
  if (!row?.deleted) {
    return { error: 'This team was not deleted. It may already be gone, or you are not a coach on it. Refresh the page.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/team/${teamId}`)
  return { success: true }
}
