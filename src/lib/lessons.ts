// Lesson history (public.lessons, migration 025). Reads use the service-role
// client after the caller's access has been checked; the pure helpers are
// shared by the clip page, the player page and tests.
import { canViewPlayerContent } from './clip-access'
import { decideStorageAccess } from './storage-access'
import { finiteDuration, formatClock } from './media-duration'

export type LessonRow = {
  id: string
  clip_id: string
  player_id: string
  coach_id: string | null
  media_path: string
  mime: string | null
  duration_ms: number | null
  created_at: string
  /** 1 = video recording (older); 2 = audio + timeline replay. */
  format_version?: number
}
export type LessonClip = { id: string; title: string | null; session_date: string | null; created_at: string }
export type LessonItem = LessonRow & { coach_name: string | null }
export type LessonGroup = { clip: LessonClip; lessons: LessonItem[] }

type DbError = { code?: string; message?: string } | null | undefined

/** Saving and deleting lessons: direct coach or a team coach (including assistants). */
export function canManageLessons(via: string | null | undefined): boolean {
  return via === 'coach' || via === 'team_coach'
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

/**
 * Length shown on a lesson row: the stored duration_ms when there is a real
 * one; otherwise (older lessons saved before duration_ms) the media's own
 * duration once the open player has a finite one; "--:--" while an open
 * player is still working it out; nothing for a closed row.
 */
export function lessonRowDuration(storedMs: number | null | undefined, mediaSeconds: number | null | undefined, open: boolean): string | null {
  if (storedMs != null && finiteDuration(storedMs / 1000) != null) return formatLessonDuration(storedMs)
  if (finiteDuration(mediaSeconds) != null) return formatClock(mediaSeconds)
  return open ? '--:--' : null
}

type Q = PromiseLike<{ data: unknown; error: DbError }> & {
  eq(c: string, v: string): Q
  in(c: string, v: string[]): Q
  not(c: string, op: string, v: null): Q
  order(c: string, o: { ascending: boolean }): Q
}
type Client = { from(t: string): { select(c: string): Q } }

const LESSON_COLS = 'id, clip_id, player_id, coach_id, media_path, mime, duration_ms, format_version, created_at'

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
      mime: null, duration_ms: null, format_version: 1, created_at: c.created_at,
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

export type LessonReplaySource =
  | { format: 1; mediaPath: string }
  | { format: 2; mediaPath: string; clipPath: string; timeline: unknown; durationMs: number | null }

/**
 * What the replay player needs for one lesson, after the storage read check on
 * the lesson file AND the clip video (both must belong to a player the viewer
 * may see). Legacy ids ("legacy:<clipId>") are format 1.
 */
export async function loadLessonReplay(client: unknown, userId: string | null | undefined, lessonId: string): Promise<LessonReplaySource | { error: string }> {
  if (!userId) return { error: 'Not authenticated' }
  const db = client as { from(t: string): { select(c: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: DbError }> } } } }
  let row: { clip_id: string; media_path: string; format_version: number | null; timeline: unknown; duration_ms: number | null } | null = null
  if (lessonId.startsWith('legacy:')) {
    const { data } = await db.from('clips').select('id, lesson_path').eq('id', lessonId.slice(7)).maybeSingle()
    const c = data as { id: string; lesson_path: string | null } | null
    if (c?.lesson_path) row = { clip_id: c.id, media_path: c.lesson_path, format_version: 1, timeline: null, duration_ms: null }
  } else {
    const { data } = await db.from('lessons').select('clip_id, media_path, format_version, timeline, duration_ms').eq('id', lessonId).maybeSingle()
    row = data as typeof row
  }
  if (!row) return { error: 'Lesson not found' }
  const lessonRead = await decideStorageAccess(client, userId, 'lessons', row.media_path, 'read')
  if (!lessonRead.allowed) return { error: 'You don\'t have access to this lesson.' }
  if (row.format_version !== 2 || row.timeline == null) return { format: 1, mediaPath: row.media_path }
  const { data: clip } = await db.from('clips').select('storage_path').eq('id', row.clip_id).maybeSingle()
  const clipPath = (clip as { storage_path?: string | null } | null)?.storage_path
  if (!clipPath) return { error: 'The clip video for this lesson is missing.' }
  const clipRead = await decideStorageAccess(client, userId, 'clips', clipPath, 'read')
  if (!clipRead.allowed || clipRead.playerId !== lessonRead.playerId) return { error: 'You don\'t have access to this lesson.' }
  return { format: 2, mediaPath: row.media_path, clipPath, timeline: row.timeline, durationMs: row.duration_ms }
}
