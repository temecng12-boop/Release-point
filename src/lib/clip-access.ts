// Who may see a player's clips (clip page, compare page, clip debug route).
//
// Allowed: the player themself, the player's direct coach, a coach on one of
// the player's teams (team_coaches, migration 018), or the player's linked
// guardian. Everyone else is treated as "not found".
//
// Reads ownership with the caller-supplied (service-role) client and always
// compares against the authenticated user's id. Does not depend on the 018
// SQL helper functions. If team_coaches (or player_teams) can't be read, e.g.
// 018 hasn't run in this database, team access is skipped and the other rules
// still apply.

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }

// Minimal shape of the Supabase query builder used here, so tests can pass a fake.
export interface AccessDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<QueryResult> & {
        maybeSingle(): PromiseLike<QueryResult>
        in(column: string, values: string[]): PromiseLike<QueryResult>
      }
    }
  }
}

export type AccessPlayer = {
  coach_id: string | null
  user_id: string | null
  guardian_id: string | null
  team_id: string | null
}

export type ClipAccess =
  | { allowed: true; via: 'player' | 'coach' | 'guardian' | 'team_coach'; teamCheck: 'ok' | 'unavailable' | 'skipped' }
  | { allowed: false; teamCheck: 'ok' | 'unavailable' | 'skipped' }

/** Pure decision for the direct relationships (no team lookup). */
export function directAccess(userId: string, player: AccessPlayer, guardianUserId: string | null): 'player' | 'coach' | 'guardian' | null {
  if (!userId) return null
  if (player.user_id && player.user_id === userId) return 'player'
  if (player.coach_id && player.coach_id === userId) return 'coach'
  if (guardianUserId && guardianUserId === userId) return 'guardian'
  return null
}

/**
 * Is userId an organizer or assistant on one of the player's teams?
 * Returns 'unavailable' (never throws) if team_coaches can't be read.
 */
export async function teamCoachAccess(db: AccessDb, userId: string, playerId: string, playerTeamId: string | null): Promise<'yes' | 'no' | 'unavailable'> {
  const teamIds = new Set<string>()
  if (playerTeamId) teamIds.add(playerTeamId)
  try {
    const links = await db.from('player_teams').select('team_id').eq('player_id', playerId)
    if (links.error) console.warn('[clip-access] player_teams unavailable', links.error.code, links.error.message)
    for (const row of (links.data as { team_id: string }[] | null) ?? []) teamIds.add(row.team_id)
    if (teamIds.size === 0) return 'no'

    const membership = await db.from('team_coaches').select('team_id').eq('coach_id', userId).in('team_id', [...teamIds])
    if (membership.error) {
      console.warn('[clip-access] team_coaches unavailable (migration 018 not applied?); team access skipped', membership.error.code, membership.error.message)
      return 'unavailable'
    }
    return ((membership.data as unknown[] | null) ?? []).length > 0 ? 'yes' : 'no'
  } catch (err) {
    console.warn('[clip-access] team lookup failed; team access skipped', err)
    return 'unavailable'
  }
}

/**
 * Full check for a player's content (clips, notes, metrics).
 * `client` is the service-role Supabase client (or a test fake). It's typed
 * loosely because matching the full generated client type against AccessDb
 * makes TypeScript give up (TS2589).
 */
export async function canViewPlayerContent(client: unknown, userId: string | null | undefined, playerId: string | null | undefined): Promise<ClipAccess> {
  if (!userId || !playerId) return { allowed: false, teamCheck: 'skipped' }
  const db = client as AccessDb

  const { data, error } = await db.from('players').select('coach_id, user_id, guardian_id, team_id').eq('id', playerId).maybeSingle()
  if (error || !data) {
    if (error) console.error('[clip-access] player lookup failed', error.code, error.message)
    return { allowed: false, teamCheck: 'skipped' }
  }
  const player = data as AccessPlayer

  let guardianUserId: string | null = null
  if (player.guardian_id) {
    const g = await db.from('guardians').select('user_id').eq('id', player.guardian_id).maybeSingle()
    if (g.error) console.warn('[clip-access] guardian lookup failed', g.error.code, g.error.message)
    guardianUserId = (g.data as { user_id: string | null } | null)?.user_id ?? null
  }

  const direct = directAccess(userId, player, guardianUserId)
  if (direct) return { allowed: true, via: direct, teamCheck: 'skipped' }

  const team = await teamCoachAccess(db, userId, playerId, player.team_id)
  if (team === 'yes') return { allowed: true, via: 'team_coach', teamCheck: 'ok' }
  return { allowed: false, teamCheck: team === 'unavailable' ? 'unavailable' : 'ok' }
}
