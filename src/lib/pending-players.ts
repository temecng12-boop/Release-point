// Coach dashboard / team roster: the coach's own players who can't have video
// yet: no age band on file (one-tap confirm), or under 13 (parent consent is
// coming soon). Read with the service role, scoped to players.coach_id = the coach.
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectPlayersWithConsent } from './consent-server'
import { pendingReason, type PendingReason, type PlayerConsentFields } from './consent'
import { PARENT_CONSENT_COMING_SOON } from './under13-mode'

type Db = Pick<SupabaseClient, 'from'>

export type PendingPlayer = {
  id: string
  full_name: string
  reason: PendingReason
  /** False before migration 037: only "Mark as 18+" is offered then. */
  bandsAvailable: boolean
}

type Row = PlayerConsentFields & { id: string; full_name: string | null; coach_id: string | null }

/** Pure: which rows need the coach, with their reason; no-band players first, then by name. */
export function pendingFromRows(rows: Row[], coachId: string): PendingPlayer[] {
  return rows
    .filter((r) => r.coach_id === coachId)
    .map((r) => ({ r, reason: pendingReason(r) }))
    .filter((x): x is { r: Row; reason: PendingReason } => x.reason !== null)
    .map(({ r, reason }) => ({
      id: r.id,
      full_name: r.full_name || 'Unnamed player',
      reason,
      bandsAvailable: !r.age_band_pending_migration,
    }))
    .sort((a, b) => (a.reason === b.reason ? a.full_name.localeCompare(b.full_name) : a.reason === 'age_band' ? -1 : 1))
}

/** The coach's pending players, optionally limited to `playerIds`. Empty on a read error (logged). */
export async function loadPendingPlayers(db: Db, coachId: string, playerIds?: string[]): Promise<PendingPlayer[]> {
  if (playerIds && playerIds.length === 0) return []
  const { data, error } = await selectPlayersWithConsent<Row[]>(
    'id, full_name, coach_id',
    (cols) => {
      const q = db.from('players').select(cols).eq('coach_id', coachId)
      return playerIds ? q.in('id', playerIds) : q
    },
  )
  if (error) {
    console.error('[loadPendingPlayers] read failed', { code: error.code ?? null, message: error.message ?? null })
    return []
  }
  return pendingFromRows((data ?? []) as Row[], coachId)
}

/** Banner lines: "3 players need their age confirmed before video can be added." / "1 player is under 13. …" */
export function pendingBannerLines(players: PendingPlayer[]): string[] {
  const ages = players.filter((p) => p.reason === 'age_band').length
  const under13 = players.length - ages
  const lines: string[] = []
  if (ages > 0) lines.push(`${ages} ${ages === 1 ? 'player needs their' : 'players need their'} age confirmed before video can be added.`)
  if (under13 > 0) lines.push(`${under13} ${under13 === 1 ? 'player is' : 'players are'} under 13, so video can't be added. ${PARENT_CONSENT_COMING_SOON}`)
  return lines
}
