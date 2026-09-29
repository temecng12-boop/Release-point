// Team coaching staff helpers. Server-only (uses the service-role client);
// import from Server Components / Server Actions only.
import { supabaseAdmin } from '@/lib/supabase/admin'

import { mergeTeamCoaches, type CoachRow, type ProfileRow, type TeamCoach } from './team-coaches-merge'

export type { TeamCoach }

/**
 * Coaches on a team with name (profiles) and email (auth.users).
 * team_coaches.coach_id references auth.users, not profiles, and profiles has
 * no email column, so a PostgREST embed can't do this; it's three reads.
 */
export async function loadTeamCoaches(teamId: string): Promise<TeamCoach[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('team_coaches')
    .select('coach_id, role')
    .eq('team_id', teamId)
  if (error) {
    console.error('[loadTeamCoaches] team_coaches read failed', { code: error.code, message: error.message })
    return []
  }
  const coachRows = (rows ?? []) as CoachRow[]
  if (coachRows.length === 0) return []
  const ids = coachRows.map(r => r.coach_id)

  const [{ data: profiles, error: profileError }, users] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, full_name').in('id', ids),
    Promise.all(ids.map(id => supabaseAdmin.auth.admin.getUserById(id))),
  ])
  if (profileError) console.error('[loadTeamCoaches] profiles read failed', { code: profileError.code, message: profileError.message })

  const emails: Record<string, string | null> = {}
  users.forEach((res, i) => {
    if (res.error) console.error('[loadTeamCoaches] auth user lookup failed', ids[i], res.error.message)
    emails[ids[i]] = res.data?.user?.email ?? null
  })
  return mergeTeamCoaches(coachRows, (profiles ?? []) as ProfileRow[], emails)
}
