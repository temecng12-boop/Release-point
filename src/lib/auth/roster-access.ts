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

/** invitePlayer's reply when the email belongs to a player who signed up on their own. */
export const SELF_SIGNED_UP_PLAYER_MESSAGE =
  "This player already has their own Release Point account, so they can't be added to your roster by email."

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

export type PlayerAccessIds = { coach_id: string | null; user_id: string | null } | null | undefined

/** True only if `userId` is the player's own account (players.user_id). */
export function isThePlayer(userId: string | null | undefined, player: PlayerAccessIds): boolean {
  if (!userId || !player) return false
  return player.user_id !== null && player.user_id === userId
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

/**
 * Who may delete a clip: the player's current coach, or the player deleting a
 * clip they uploaded themselves. A former coach (or anyone else who once
 * uploaded) may not.
 */
export function canDeleteClip(userId: string, uploadedBy: string | null | undefined, player: PlayerAccessIds): boolean {
  if (isPlayersOwnCoach(userId, player)) return true
  return isThePlayer(userId, player) && !!uploadedBy && uploadedBy === userId
}

/**
 * Who may delete a timestamp note or annotation: its author, and only while
 * they are still the player's current coach or are the player themself.
 */
export function canDeleteClipItem(userId: string, createdBy: string | null | undefined, player: PlayerAccessIds): boolean {
  if (!createdBy || createdBy !== userId) return false
  return isPlayersOwnCoach(userId, player) || isThePlayer(userId, player)
}

export type BullpenPitchBlock = { pitch_type: string; target: number; thrown: number; focus: string }
export type BullpenSessionUpdates = {
  pitches?: BullpenPitchBlock[]
  notes?: string
  status?: 'planned' | 'complete'
}

function toPitchBlock(v: unknown): BullpenPitchBlock | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.pitch_type !== 'string') return null
  const target = Number(r.target ?? 0)
  const thrown = Number(r.thrown ?? 0)
  if (!Number.isFinite(target) || !Number.isFinite(thrown)) return null
  return { pitch_type: r.pitch_type, target, thrown, focus: typeof r.focus === 'string' ? r.focus : '' }
}

/**
 * Keeps only the bullpen session fields a coach may change: pitches, notes and
 * status. Anything else (player_id, coach_id, ids, dates) is dropped. Returns
 * null if a provided field has the wrong shape.
 */
export function pickBullpenUpdates(updates: unknown): BullpenSessionUpdates | null {
  if (!updates || typeof updates !== 'object') return null
  const u = updates as Record<string, unknown>
  const out: BullpenSessionUpdates = {}
  if (u.pitches !== undefined) {
    if (!Array.isArray(u.pitches)) return null
    const blocks = u.pitches.map(toPitchBlock)
    if (blocks.some((b) => b === null)) return null
    out.pitches = blocks as BullpenPitchBlock[]
  }
  if (u.notes !== undefined) {
    if (typeof u.notes !== 'string') return null
    out.notes = u.notes
  }
  if (u.status !== undefined) {
    if (u.status !== 'planned' && u.status !== 'complete') return null
    out.status = u.status
  }
  return out
}
