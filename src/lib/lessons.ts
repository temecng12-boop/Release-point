// Lesson history (public.lessons, migration 025). Reads use the service-role
// client after the caller's access has been checked; the pure helpers are
// shared by the clip page, the player page and tests.
import { canViewPlayerContent } from './clip-access'

export type LessonRow = {
  id: string
  clip_id: string
  player_id: string
  coach_id: string | null
  media_path: string
  mime: string | null
  duration_ms: number | null
  created_at: string
}
export type LessonClip = { id: string; title: string | null; session_date: string | null; created_at: string }
export type LessonItem = LessonRow & { coach_name: string | null }
export type LessonGroup = { clip: LessonClip; lessons: LessonItem[] }

type DbError = { code?: string; message?: string } | null | undefined

/** Saving and deleting lessons is for the player's direct coach only; team coaches view. */
export function canManageLessons(via: string | null | undefined): boolean {
  return via === 'coach'
}

/** PostgREST / Postgres "table not found" (025 not applied yet). */
export function isMissingTableError(e: DbError): boolean {
  if (!e) return false
  return e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(e.message ?? '')
}

export const LESSONS_MISSING_MESSAGE =
  'Lesson saved, but lesson history needs a database update (migration 025). Until then only the newest lesson is shown.'

const newestFirst = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at.localeCompare(a.created_at)

/**
 * Group lessons by clip: each clip's lessons newest first, clips ordered by
 * their newest lesson. Lessons whose clip isn't in `clips` are dropped.
 */
export function groupLessonsByClip(lessons: LessonRow[], clips: LessonClip[], coachNames: Record<string, string | null> = {}): LessonGroup[] {
  const byId = new Map(clips.map(c => [c.id, c]))
  const groups = new Map<string, LessonGroup>()
  for (const l of lessons) {
    const clip = byId.get(l.clip_id)
    if (!clip) continue
    const g = groups.get(clip.id) ?? { clip, lessons: [] }
    g.lessons.push({ ...l, coach_name: l.coach_id ? coachNames[l.coach_id] ?? null : null })
    groups.set(clip.id, g)
  }
  const out = [...groups.values()]
  for (const g of out) g.lessons.sort(newestFirst)
  out.sort((a, b) => newestFirst(a.lessons[0], b.lessons[0]))
  return out
}

/** "0:09", "1:05", "12:30"; null for unknown. */
export function formatLessonDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Q = PromiseLike<{ data: unknown; error: DbError }> & {
  eq(c: string, v: string): Q
  in(c: string, v: string[]): Q
  not(c: string, op: string, v: null): Q
  order(c: string, o: { ascending: boolean }): Q
}
type Client = { from(t: string): { select(c: string): Q } }

const LESSON_COLS = 'id, clip_id, player_id, coach_id, media_path, mime, duration_ms, created_at'

/**
 * All lessons for a player or a clip, newest first, with coach names. If the
 * lessons table is missing (025 not applied) it falls back to clips.lesson_path
 * (one lesson per clip, id "legacy:<clipId>") and sets legacy = true.
 */
export async function loadLessons(client: unknown, filter: { playerId: string } | { clipId: string }): Promise<{ lessons: LessonItem[]; clips: LessonClip[]; legacy: boolean }> {
  const db = client as Client
  const [col, val] = 'playerId' in filter ? ['player_id', filter.playerId] : ['clip_id', filter.clipId]
  let legacy = false
  let rows: LessonRow[] = []
  const res = await db.from('lessons').select(LESSON_COLS).eq(col, val).order('created_at', { ascending: false })
  if (res.error) {
    if (!isMissingTableError(res.error)) throw new Error(`load lessons: ${res.error.message}`)
    legacy = true
    const clipCol = 'playerId' in filter ? 'player_id' : 'id'
    const lr = await db.from('clips').select('id, player_id, lesson_path, created_at').eq(clipCol, val).not('lesson_path', 'is', null)
    rows = ((lr.data ?? []) as { id: string; player_id: string; lesson_path: string; created_at: string }[]).map(c => ({
      id: `legacy:${c.id}`, clip_id: c.id, player_id: c.player_id, coach_id: null, media_path: c.lesson_path,
      mime: null, duration_ms: null, created_at: c.created_at,
    }))
  } else {
    rows = (res.data ?? []) as LessonRow[]
  }
  const clipIds = [...new Set(rows.map(r => r.clip_id))]
  const clips = clipIds.length
    ? (((await db.from('clips').select('id, title, session_date, created_at').in('id', clipIds)).data ?? []) as LessonClip[])
    : []
  const coachIds = [...new Set(rows.map(r => r.coach_id).filter((x): x is string => !!x))]
  const names: Record<string, string | null> = {}
  if (coachIds.length) {
    const pr = await db.from('profiles').select('id, full_name').in('id', coachIds)
    for (const p of (pr.data ?? []) as { id: string; full_name: string | null }[]) names[p.id] = p.full_name
  }
  return { lessons: rows.map(r => ({ ...r, coach_name: r.coach_id ? names[r.coach_id] ?? null : null })), clips, legacy }
}

/**
 * Data for the "Coach's Lesson Feedback" section. Null means render nothing:
 * the viewer can't view the player, or lessons couldn't be loaded (logged,
 * never thrown, so the page still renders). Before 025 it falls back to
 * clips.lesson_path; before 019 as well it is simply empty.
 */
export async function loadLessonFeedback(client: unknown, viewerId: string, playerId: string): Promise<{ groups: LessonGroup[]; canManage: boolean; legacy: boolean } | null> {
  try {
    const access = await canViewPlayerContent(client, viewerId, playerId)
    if (!access.allowed) return null
    const data = await loadLessons(client, { playerId })
    return { groups: groupLessonsByClip(data.lessons, data.clips), canManage: canManageLessons(access.via), legacy: data.legacy }
  } catch (e) {
    console.error('[lessons] feedback load failed', e)
    return null
  }
}
