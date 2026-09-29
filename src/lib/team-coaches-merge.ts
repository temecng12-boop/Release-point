// Pure helpers for the team coaching staff list (no I/O, unit tested).

export type TeamCoach = {
  coach_id: string
  role: string
  profiles: { full_name: string | null; email: string | null }
}

export type CoachRow = { coach_id: string; role: string }
export type ProfileRow = { id: string; full_name: string | null }

/** Pure: join team_coaches rows with names and emails; organizer first, then by name. */
export function mergeTeamCoaches(rows: CoachRow[], profiles: ProfileRow[], emails: Record<string, string | null>): TeamCoach[] {
  const names = new Map(profiles.map(p => [p.id, p.full_name]))
  return rows
    .map(r => ({
      coach_id: r.coach_id,
      role: r.role,
      profiles: { full_name: names.get(r.coach_id) ?? null, email: emails[r.coach_id] ?? null },
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'organizer' ? -1 : b.role === 'organizer' ? 1 : a.role.localeCompare(b.role)
      const an = (a.profiles.full_name ?? a.profiles.email ?? '').toLowerCase()
      const bn = (b.profiles.full_name ?? b.profiles.email ?? '').toLowerCase()
      return an.localeCompare(bn)
    })
}
