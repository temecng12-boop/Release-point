// Pure roster authorization rules (no database access), shared by server code
// and unit tests. Server code looks up the rows and passes them in.

export type PlayerOwnerRow = { coach_id: string | null } | null | undefined

/** True only if `userId` is this player's own coach (players.coach_id). */
export function isPlayersOwnCoach(userId: string | null | undefined, player: PlayerOwnerRow): boolean {
  if (!userId || !player) return false
  return player.coach_id !== null && player.coach_id === userId
}

/** Team ids in `requested` that are not in `owned` (the caller's own teams). */
export function teamIdsNotOwned(requested: readonly string[], owned: readonly string[]): string[] {
  const ownedSet = new Set(owned)
  return requested.filter((id) => !ownedSet.has(id))
}

/** Player fields a coach may change through updatePlayer. Anything else is dropped. */
export const COACH_EDITABLE_PLAYER_FIELDS = ['full_name', 'age_group', 'position'] as const
export type CoachEditablePlayerFields = Partial<Record<(typeof COACH_EDITABLE_PLAYER_FIELDS)[number], string>>

export function pickCoachEditableFields(data: Record<string, unknown>): CoachEditablePlayerFields {
  const out: CoachEditablePlayerFields = {}
  for (const key of COACH_EDITABLE_PLAYER_FIELDS) {
    const v = data[key]
    if (typeof v === 'string') out[key] = v
  }
  return out
}

export type ProfilePageAccess = 'view' | 'redirect-dashboard' | 'not-found'

/**
 * Coach player-profile page (/profile/[id]). It's a coach page: only the
 * player's own coach sees it. Non-coaches (players, guardians) are sent to
 * their own dashboard, as before. Any other coach, including for a player
 * with no coach, gets a 404.
 */
export function profilePageAccess(
  userId: string,
  role: string | null | undefined,
  player: PlayerOwnerRow,
): ProfilePageAccess {
  if (role !== 'coach') return 'redirect-dashboard'
  return isPlayersOwnCoach(userId, player) ? 'view' : 'not-found'
}

/**
 * Splits a team roster into the caller's own players and everyone else
 * (other coaches' players, or players with no coach).
 */
export function splitRosterByCoach<T extends { coach_id: string | null }>(
  userId: string,
  players: readonly T[],
): { own: T[]; others: T[] } {
  const own: T[] = []
  const others: T[] = []
  for (const p of players) (isPlayersOwnCoach(userId, p) ? own : others).push(p)
  return { own, others }
}
