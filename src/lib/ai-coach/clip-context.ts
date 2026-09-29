// Loads what the AI Coach should know about a clip, on the server, for the
// signed-in user. Only import from Route Handlers / Server Actions.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isCoachOnPlayersTeam } from '@/lib/team-access'
import type { CoachClipDetails, CoachHittingMetrics, CoachMetric, CoachPhaseRow, CoachTimestampNote } from './prompt'

export type LoadedClipContext = {
  playerName: string | null
  ageGroup: string | null
  position: string | null
  clip: CoachClipDetails
  coachNotes: string | null
  checklist: CoachPhaseRow[] | null
  metrics: CoachMetric[]
  hittingMetrics: CoachHittingMetrics | null
  timestampNotes: CoachTimestampNote[]
}

export type ClipContextResult =
  | { ok: true; context: LoadedClipContext }
  | { ok: false; status: 404 | 500; message: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same people who can open the clip page: the player's direct coach, a coach on
// one of the player's teams (018), the player, or the player's guardian.
async function canView(userId: string, playerId: string, player: { coach_id: string | null; user_id: string | null; guardian_id: string | null; team_id: string | null }) {
  if (player.coach_id === userId || player.user_id === userId) return true
  if (player.guardian_id) {
    const { data } = await supabaseAdmin
      .from('guardians')
      .select('id')
      .eq('id', player.guardian_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (data) return true
  }
  return isCoachOnPlayersTeam(userId, playerId, player.team_id)
}

export async function loadClipContext(userId: string, clipId: string): Promise<ClipContextResult> {
  if (!UUID_RE.test(clipId)) return { ok: false, status: 404, message: 'Clip not found' }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('id, title, session_date, created_at, notes, voice_path, player_id')
    .eq('id', clipId)
    .maybeSingle()
  if (clipError) {
    console.error('[ai-coach] clip lookup failed', clipId, clipError)
    return { ok: false, status: 500, message: 'Could not load this clip.' }
  }
  if (!clip) return { ok: false, status: 404, message: 'Clip not found' }

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('full_name, age_group, position, coach_id, user_id, guardian_id, team_id')
    .eq('id', clip.player_id)
    .maybeSingle()
  // Unauthorized callers get the same 404 so clip existence isn't revealed.
  if (!player || !(await canView(userId, clip.player_id, player))) return { ok: false, status: 404, message: 'Clip not found' }

  // Columns added by later migrations are read separately so a missing column
  // only drops that piece of context instead of failing the whole request.
  const [checklistRes, lessonRes, hittingRes, annotationsRes] = await Promise.all([
    supabaseAdmin.from('clips').select('phase_checklist').eq('id', clipId).maybeSingle(),
    supabaseAdmin.from('clips').select('lesson_path').eq('id', clipId).maybeSingle(),
    supabaseAdmin.from('clips').select('hitting_metrics').eq('id', clipId).maybeSingle(),
    supabaseAdmin.from('annotations').select('id', { count: 'exact', head: true }).eq('clip_id', clipId),
  ])
  if (checklistRes.error) console.warn('[ai-coach] phase_checklist unavailable', checklistRes.error.message)
  if (lessonRes.error) console.warn('[ai-coach] lesson_path unavailable', lessonRes.error.message)
  if (hittingRes.error) console.warn('[ai-coach] hitting_metrics unavailable', hittingRes.error.message)

  let timestampNotes: CoachTimestampNote[] = []
  {
    const withDrawings = await supabaseAdmin
      .from('timestamp_notes')
      .select('time_seconds, body, drawing_data')
      .eq('clip_id', clipId)
      .order('time_seconds')
    if (!withDrawings.error) {
      timestampNotes = (withDrawings.data ?? []).map(n => ({
        time_seconds: Number(n.time_seconds),
        body: n.body ?? '',
        has_drawing: Array.isArray(n.drawing_data) && n.drawing_data.length > 0,
      }))
    } else {
      const plain = await supabaseAdmin
        .from('timestamp_notes')
        .select('time_seconds, body')
        .eq('clip_id', clipId)
        .order('time_seconds')
      if (plain.error) console.warn('[ai-coach] timestamp_notes unavailable', plain.error.message)
      timestampNotes = (plain.data ?? []).map(n => ({ time_seconds: Number(n.time_seconds), body: n.body ?? '' }))
    }
  }

  let metrics: CoachMetric[] = []
  {
    const full = await supabaseAdmin
      .from('pitch_metrics')
      .select('pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa')
      .eq('clip_id', clipId)
      .order('created_at')
    if (!full.error) {
      metrics = (full.data ?? []) as CoachMetric[]
    } else {
      const core = await supabaseAdmin
        .from('pitch_metrics')
        .select('pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
        .eq('clip_id', clipId)
        .order('created_at')
      if (core.error) console.warn('[ai-coach] pitch_metrics unavailable', core.error.message)
      metrics = (core.data ?? []) as CoachMetric[]
    }
  }

  const checklist = (checklistRes.data as { phase_checklist?: CoachPhaseRow[] | null } | null)?.phase_checklist ?? null
  const lessonPath = (lessonRes.data as { lesson_path?: string | null } | null)?.lesson_path ?? null
  const hitting = (hittingRes.data as { hitting_metrics?: CoachHittingMetrics | null } | null)?.hitting_metrics ?? null

  return {
    ok: true,
    context: {
      playerName: player.full_name ?? null,
      ageGroup: player.age_group ?? null,
      position: player.position ?? null,
      clip: {
        title: clip.title ?? null,
        session_date: clip.session_date ?? null,
        uploaded_at: clip.created_at ?? null,
        has_voice_note: !!clip.voice_path,
        has_lesson_recording: !!lessonPath,
        annotation_count: annotationsRes.count ?? 0,
      },
      coachNotes: clip.notes ?? null,
      checklist: Array.isArray(checklist) ? checklist : null,
      metrics,
      hittingMetrics: hitting && typeof hitting === 'object' && !Array.isArray(hitting) ? hitting : null,
      timestampNotes,
    },
  }
}
