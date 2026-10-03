// Coach dashboard / team roster: the coach's own players who can't have video
// yet (age band unknown, or under 13 without guardian consent). Read with the
// service role, scoped to players.coach_id = the coach.
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectPlayersWithConsent } from './consent-server'
import { pendingReason, type PendingReason, type PlayerConsentFields } from './consent'

type Db = Pick<SupabaseClient, 'from'>

export type PendingPlayer = {
  id: string
  full_name: string
  reason: PendingReason
  guardianEmail: string | null
  guardianName: string | null
  /** False before migration 035: only "Mark as 18+" is offered then. */
  bandsAvailable: boolean
}

type Row = PlayerConsentFields & { id: string; full_name: string | null; coach_id: string | null; guardian_id: string | null }

/** Pure: which rows need the coach, with their reason, sorted by name. */
export function pendingFromRows(rows: Row[], coachId: string, guardians: Record<string, { email: string; full_name: string | null }> = {}): PendingPlayer[] {
  return rows
    .filter((r) => r.coach_id === coachId)
    .map((r) => ({ r, reason: pendingReason(r) }))
    .filter((x): x is { r: Row; reason: PendingReason } => x.reason !== null)
    .map(({ r, reason }) => ({
      id: r.id,
      full_name: r.full_name || 'Unnamed player',
      reason,
      guardianEmail: r.guardian_id ? guardians[r.guardian_id]?.email ?? null : null,
      guardianName: r.guardian_id ? guardians[r.guardian_id]?.full_name ?? null : null,
      bandsAvailable: !r.age_band_pending_migration,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/** The coach's pending players, optionally limited to `playerIds`. Empty on a read error (logged). */
export async function loadPendingPlayers(db: Db, coachId: string, playerIds?: string[]): Promise<PendingPlayer[]> {
  if (playerIds && playerIds.length === 0) return []
  const { data, error } = await selectPlayersWithConsent<Row[]>(
    'id, full_name, coach_id, guardian_id',
    (cols) => {
      const q = db.from('players').select(cols).eq('coach_id', coachId)
      return playerIds ? q.in('id', playerIds) : q
    },
  )
  if (error) {
    console.error('[loadPendingPlayers] read failed', { code: error.code ?? null, message: error.message ?? null })
    return []
  }
  const rows = (data ?? []) as Row[]
  const guardianIds = [...new Set(rows.filter((r) => pendingReason(r) === 'guardian_consent' && r.guardian_id).map((r) => r.guardian_id as string))]
  const guardians: Record<string, { email: string; full_name: string | null }> = {}
  if (guardianIds.length > 0) {
    const { data: gs, error: gError } = await db.from('guardians').select('id, email, full_name').in('id', guardianIds)
    if (gError) console.error('[loadPendingPlayers] guardian read failed', { message: gError.message })
    for (const g of (gs ?? []) as { id: string; email: string; full_name: string | null }[]) guardians[g.id] = g
  }
  return pendingFromRows(rows, coachId, guardians)
}

/** "3 players need an age confirmation or under-13 guardian consent." */
export function pendingBannerTitle(players: PendingPlayer[]): string {
  const n = players.length
  const ages = players.filter((p) => p.reason === 'age_band').length
  const consent = n - ages
  const what = ages > 0 && consent > 0
    ? 'an age confirmation or under-13 guardian consent'
    : ages > 0 ? 'an age confirmation' : 'guardian consent (under 13)'
  return `${n} ${n === 1 ? 'player needs' : 'players need'} ${what} before video can be added.`
}
