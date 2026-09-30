// Server-side context for the AI coach (/api/ai-chat), RP-041.
//
// The client sends only which clip or player the chat is about. Everything the
// prompt says about the player (name, age group, position, pitch data,
// checklist, notes) is loaded here, after checking that the caller is that
// player's own coach, a coach on one of the player's teams, or the player
// themself (not guardians). The Supabase client is passed in so this can be
// unit tested with a mock.
import type { SupabaseClient } from '@supabase/supabase-js'
import { canUseAiCoachFor } from './auth/roster-access'
import { teamCoachAccess, type AccessDb } from './clip-access'

type Db = Pick<SupabaseClient, 'from'>

export type AiChatMetric = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}

export type AiChatPhaseRow = {
  name: string
  rating: 'good' | 'needs_work' | 'critical' | null
  note: string
}

export type AiChatContext = {
  playerName: string
  ageGroup: string | null
  position: string | null
  metrics: AiChatMetric[]
  checklist: AiChatPhaseRow[] | null
  coachNotes: string | null
}

export type AiChatContextResult =
  | { ok: true; context: AiChatContext }
  | { ok: false; status: 400 | 404 }

const METRIC_COLUMNS = 'pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break'

type PlayerRow = {
  id: string
  full_name: string | null
  age_group: string | null
  position: string | null
  coach_id: string | null
  user_id: string | null
  team_id: string | null
}

async function loadPlayer(db: Db, playerId: string): Promise<PlayerRow | null> {
  const { data } = await db
    .from('players')
    .select('id, full_name, age_group, position, coach_id, user_id, team_id')
    .eq('id', playerId)
    .maybeSingle()
  return (data as PlayerRow | null) ?? null
}

/**
 * Loads the AI coach context for `clipId` (a clip chat) or, if no clip is
 * given, `playerId` (the player-profile chat). Returns 404 when the target
 * doesn't exist or the caller isn't the player's own coach, a coach on one of
 * the player's teams (team_coaches), or the player.
 */
export async function loadAiChatContext(
  db: Db,
  userId: string,
  target: { clipId?: unknown; playerId?: unknown },
): Promise<AiChatContextResult> {
  const clipId = typeof target.clipId === 'string' && target.clipId ? target.clipId : null
  const playerIdArg = typeof target.playerId === 'string' && target.playerId ? target.playerId : null
  if (!clipId && !playerIdArg) return { ok: false, status: 400 }

  let playerId = playerIdArg
  let clipNotes: string | null = null
  if (clipId) {
    const { data: clip } = await db.from('clips').select('player_id, notes').eq('id', clipId).maybeSingle()
    const c = clip as { player_id: string | null; notes: string | null } | null
    if (!c?.player_id) return { ok: false, status: 404 }
    playerId = c.player_id
    clipNotes = c.notes ?? null
  }

  const player = await loadPlayer(db, playerId!)
  if (!player) return { ok: false, status: 404 }
  if (!canUseAiCoachFor(userId, player)) {
    // Team coaches read the same data they can see on the clip page.
    const team = await teamCoachAccess(db as unknown as AccessDb, userId, player.id, player.team_id ?? null)
    if (team !== 'yes') return { ok: false, status: 404 }
  }

  let metrics: AiChatMetric[] = []
  let checklist: AiChatPhaseRow[] | null = null
  if (clipId) {
    const { data: m } = await db.from('pitch_metrics').select(METRIC_COLUMNS).eq('clip_id', clipId)
    metrics = (m as AiChatMetric[] | null) ?? []
    // phase_checklist may not be migrated yet; treat an error as "no checklist".
    const { data: pc, error: pcError } = await db.from('clips').select('phase_checklist').eq('id', clipId).maybeSingle()
    if (!pcError) checklist = (pc as { phase_checklist: AiChatPhaseRow[] | null } | null)?.phase_checklist ?? null
  } else {
    const { data: clips } = await db.from('clips').select('id').eq('player_id', player.id)
    const clipIds = ((clips as { id: string }[] | null) ?? []).map((c) => c.id)
    if (clipIds.length > 0) {
      const { data: m } = await db.from('pitch_metrics').select(METRIC_COLUMNS).in('clip_id', clipIds)
      metrics = (m as AiChatMetric[] | null) ?? []
    }
  }

  return {
    ok: true,
    context: {
      playerName: player.full_name ?? '',
      ageGroup: player.age_group,
      position: player.position,
      metrics,
      checklist,
      coachNotes: clipId ? clipNotes : null,
    },
  }
}

/** Keeps only well-formed chat turns from the request body. */
export function sanitizeChatMessages(messages: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object' &&
      ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant') &&
      typeof (m as { content?: unknown }).content === 'string')
    .map((m) => ({ role: m.role, content: m.content }))
}
