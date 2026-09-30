// Server-side account deletion, used by deleteAccount() in src/app/actions/auth.ts.
//
// Three phases, all keyed strictly on the signed-in user's id (U):
//   1. gatherDeletionFacts: read every row that references U (tolerates missing
//      tables/columns, e.g. migrations 018-020 not applied).
//   2. planAccountDeletion: pure function deciding, per row, delete vs detach.
//   3. executeDeletionPlan: remove storage files (listed first, exact paths only),
//      then run the DB steps in FK-safe order. The caller then deletes the auth user.
//
// Per-table policy (U = the deleting user):
//   players.user_id = U         delete the player row (cascades clips, annotations,
//                               timestamp_notes, pitch_metrics, bullpen_sessions,
//                               player_teams, pitch_analysis) + its storage folders.
//   players.coach_id = U        detach (coach_id = null). If afterwards nobody with an
//                               account is linked (no player login, no guardian login,
//                               no organizer of one of its teams) the player is deleted.
//   players.guardian_id -> U    detach (guardian_id = null); same "no account left" rule.
//   guardians.user_id = U       delete the guardian row (after detaching players).
//   guardians.created_by = U    set null (column only exists on some branches; skipped if missing).
//   teams.coach_id = U          transfer to another coach from team_coaches (existing
//                               organizer first, then earliest joined) if 018 is live and
//                               one exists; otherwise detach players.team_id and delete the
//                               team (player_teams/team_coaches rows cascade). Players kept.
//   team_coaches.coach_id = U   delete (also ON DELETE CASCADE from auth.users).
//   clips.uploaded_by = U       on players that are kept: reassign to the player's heir
//                               (player login, then current coach, then guardian login, then
//                               team organizer); if no heir, delete the clip + its files.
//   pitch_metrics.created_by=U  same as clips (measurements belong to the player).
//   annotations/timestamp_notes.created_by = U
//                               delete (U's own commentary), incl. timestamp voice files.
//   waitlist.email = U's email  delete.
//   profiles.id = U             ON DELETE CASCADE when the auth user is deleted.
//   players.adult_confirmed_by  ON DELETE SET NULL (branch column), nothing to do.
//   bullpen_sessions.coach_id, pitch_analysis.coach_id
//                               no FK; kept with the player's data (the id just dangles).
//   storage profiles/avatars/<U>.<ext>  removed.

export type Row = Record<string, unknown>
export type DbError = { code?: string; message: string }
export type Filters = Record<string, string[]>

export interface DeletionDb {
  select(table: string, columns: string, filters: Filters): Promise<{ rows: Row[]; error?: undefined } | { rows?: undefined; error: DbError }>
  update(table: string, set: Row, filters: Filters): Promise<{ error?: DbError | null }>
  delete(table: string, filters: Filters): Promise<{ error?: DbError | null }>
}
export interface DeletionStorage {
  list(bucket: string, folder: string, search?: string): Promise<{ files: string[]; folders: string[]; error?: undefined } | { error: DbError }>
  remove(bucket: string, paths: string[]): Promise<{ error?: DbError | null }>
}

export class AccountDeletionError extends Error {
  constructor(public step: string, public detail: string) {
    super(`${step}: ${detail}`)
  }
}

export function isMissingRelation(e: DbError | null | undefined): boolean {
  if (!e) return false
  return e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(e.message)
}
export function isMissingColumn(e: DbError | null | undefined): boolean {
  if (!e) return false
  return e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the '.*' column/i.test(e.message)
}

// ── Facts ────────────────────────────────────────────────────────────────────
export type PlayerRow = { id: string; user_id: string | null; coach_id: string | null; guardian_id: string | null; team_id: string | null }
export type ClipRow = { id: string; player_id: string; uploaded_by: string; storage_path: string | null; voice_path?: string | null; lesson_path?: string | null }
export type TeamCoachRow = { team_id: string; coach_id: string; role: string; joined_at: string | null }

export type DeletionFacts = {
  userId: string
  email: string | null
  players: Record<string, PlayerRow>            // every player referenced below
  ownPlayerIds: string[]                         // players.user_id = U
  coachedPlayerIds: string[]                     // players.coach_id = U
  myGuardianIds: string[]                        // guardians.user_id = U
  guardianUsers: Record<string, string | null>   // guardian id -> user id
  playerTeamIds: Record<string, string[]>        // player id -> team ids (team_id + player_teams)
  teamOrganizers: Record<string, string>         // team id -> teams.coach_id
  organizedTeamIds: string[]                     // teams.coach_id = U
  teamCoaches: TeamCoachRow[] | null             // for organizedTeamIds; null = table unavailable
  clips: Record<string, ClipRow>                 // uploaded by U, or parents of U's notes/metrics
  uploadedClipIds: string[]
  authoredMetrics: { id: string; clip_id: string }[]
  authoredAnnotations: { id: string; clip_id: string }[]
  authoredNotes: { id: string; clip_id: string; body: string | null }[]
  log: string[]
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)]
const CHUNK = 100
const chunks = <T,>(xs: T[]) => { const out: T[][] = []; for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK)); return out }

async function readRows(db: DeletionDb, log: string[], table: string, columns: string, column: string, values: (string | null | undefined)[]): Promise<Row[] | null> {
  const vals = uniq(values.filter((v): v is string => !!v))
  if (vals.length === 0) return []
  const out: Row[] = []
  for (const part of chunks(vals)) {
    const r = await db.select(table, columns, { [column]: part })
    if (r.error) {
      if (isMissingRelation(r.error)) { log.push(`skip ${table}: table missing`); return null }
      throw new AccountDeletionError(`read ${table}`, r.error.message)
    }
    out.push(...r.rows)
  }
  return out
}

/** Read the optional clip path columns one by one so a missing column (e.g. lesson_path before 019) is skipped. */
async function readClipExtras(db: DeletionDb, log: string[], clipIds: string[], clips: Record<string, ClipRow>) {
  for (const col of ['voice_path', 'lesson_path'] as const) {
    if (clipIds.length === 0) return
    try {
      const rows = await readRows(db, log, 'clips', `id, ${col}`, 'id', clipIds)
      for (const r of rows ?? []) if (clips[r.id as string]) clips[r.id as string][col] = (r[col] as string | null) ?? null
    } catch (e) {
      if (e instanceof AccountDeletionError && /column|schema cache/i.test(e.detail)) { log.push(`skip clips.${col}: column missing`); continue }
      throw e
    }
  }
}

const PLAYER_COLS = 'id, user_id, coach_id, guardian_id, team_id'
const CLIP_COLS = 'id, player_id, uploaded_by, storage_path'

export async function gatherDeletionFacts(db: DeletionDb, userId: string, email: string | null): Promise<DeletionFacts> {
  if (!userId) throw new AccountDeletionError('gather', 'no user id')
  const log: string[] = []
  const U = [userId]
  const players: Record<string, PlayerRow> = {}
  const addPlayers = (rows: Row[] | null) => { for (const r of rows ?? []) players[r.id as string] = r as PlayerRow; return (rows ?? []).map(r => r.id as string) }

  const ownPlayerIds = addPlayers(await readRows(db, log, 'players', PLAYER_COLS, 'user_id', U))
  const coachedPlayerIds = addPlayers(await readRows(db, log, 'players', PLAYER_COLS, 'coach_id', U)).filter(id => !ownPlayerIds.includes(id))
  const myGuardianIds = ((await readRows(db, log, 'guardians', 'id, user_id', 'user_id', U)) ?? []).map(r => r.id as string)
  addPlayers(await readRows(db, log, 'players', PLAYER_COLS, 'guardian_id', myGuardianIds))

  const uploaded = (await readRows(db, log, 'clips', CLIP_COLS, 'uploaded_by', U)) ?? []
  const authoredMetrics = ((await readRows(db, log, 'pitch_metrics', 'id, clip_id', 'created_by', U)) ?? []) as { id: string; clip_id: string }[]
  const authoredAnnotations = ((await readRows(db, log, 'annotations', 'id, clip_id', 'created_by', U)) ?? []) as { id: string; clip_id: string }[]
  const authoredNotes = ((await readRows(db, log, 'timestamp_notes', 'id, clip_id, body', 'created_by', U)) ?? []) as { id: string; clip_id: string; body: string | null }[]

  const clips: Record<string, ClipRow> = {}
  for (const r of uploaded) clips[r.id as string] = r as ClipRow
  const parentIds = uniq([...authoredMetrics, ...authoredAnnotations, ...authoredNotes].map(r => r.clip_id)).filter(id => !clips[id])
  for (const r of (await readRows(db, log, 'clips', CLIP_COLS, 'id', parentIds)) ?? []) clips[r.id as string] = r as ClipRow
  await readClipExtras(db, log, Object.keys(clips), clips)

  // Players behind those clips
  addPlayers(await readRows(db, log, 'players', PLAYER_COLS, 'id', Object.values(clips).map(c => c.player_id).filter(id => !players[id])))

  // Guardian logins of every referenced player
  const guardianUsers: Record<string, string | null> = {}
  for (const r of (await readRows(db, log, 'guardians', 'id, user_id', 'id', Object.values(players).map(p => p.guardian_id))) ?? []) {
    guardianUsers[r.id as string] = (r.user_id as string | null) ?? null
  }

  // Teams of every referenced player (players.team_id + player_teams), and their organizers
  const playerTeamIds: Record<string, string[]> = {}
  for (const p of Object.values(players)) playerTeamIds[p.id] = p.team_id ? [p.team_id] : []
  const pt = await readRows(db, log, 'player_teams', 'player_id, team_id', 'player_id', Object.keys(players))
  for (const r of pt ?? []) {
    const list = playerTeamIds[r.player_id as string] ?? (playerTeamIds[r.player_id as string] = [])
    if (!list.includes(r.team_id as string)) list.push(r.team_id as string)
  }
  const organizedTeamIds = ((await readRows(db, log, 'teams', 'id, coach_id', 'coach_id', U)) ?? []).map(r => r.id as string)
  const teamOrganizers: Record<string, string> = {}
  for (const id of organizedTeamIds) teamOrganizers[id] = userId
  for (const r of (await readRows(db, log, 'teams', 'id, coach_id', 'id', Object.values(playerTeamIds).flat().filter(t => !teamOrganizers[t]))) ?? []) {
    teamOrganizers[r.id as string] = r.coach_id as string
  }
  const teamCoaches = (await readRows(db, log, 'team_coaches', 'team_id, coach_id, role, joined_at', 'team_id', organizedTeamIds)) as TeamCoachRow[] | null

  return {
    userId, email, players, ownPlayerIds, coachedPlayerIds, myGuardianIds, guardianUsers, playerTeamIds, teamOrganizers,
    organizedTeamIds, teamCoaches, clips, uploadedClipIds: uploaded.map(r => r.id as string),
    authoredMetrics, authoredAnnotations, authoredNotes, log,
  }
}

// ── Plan ─────────────────────────────────────────────────────────────────────
export type StorageTarget = { bucket: 'clips' | 'lessons' | 'profiles'; path: string }

export type DeletionPlan = {
  userId: string
  email: string | null
  transferTeams: { teamId: string; toCoachId: string }[]
  deleteTeamIds: string[]
  deleteAnnotationIds: string[]
  deleteNoteIds: string[]
  reassignMetrics: { to: string; ids: string[] }[]
  deleteMetricIds: string[]
  reassignClips: { to: string; ids: string[] }[]
  deleteClipIds: string[]
  detachCoachPlayerIds: string[]
  detachGuardianIds: string[]
  deletePlayerIds: string[]
  deleteGuardianIds: string[]
  storageFolders: StorageTarget[]   // listed, then each listed file removed by exact path
  storageFiles: StorageTarget[]     // exact paths known from rows
  avatarOwner: string               // profiles bucket: avatars/<userId>.<ext>
}

const VOICE_PREFIX = '__voice__:'

function group(pairs: [string, string][]): { to: string; ids: string[] }[] {
  const m = new Map<string, string[]>()
  for (const [to, id] of pairs) m.set(to, [...(m.get(to) ?? []), id])
  return [...m.entries()].map(([to, ids]) => ({ to, ids }))
}

export function planAccountDeletion(f: DeletionFacts): DeletionPlan {
  const U = f.userId

  // Teams U organizes: hand over to another coach on the team if 018 is live, else delete.
  const transferTeams: { teamId: string; toCoachId: string }[] = []
  const deleteTeamIds: string[] = []
  for (const teamId of f.organizedTeamIds) {
    const others = (f.teamCoaches ?? []).filter(tc => tc.team_id === teamId && tc.coach_id && tc.coach_id !== U)
    others.sort((a, b) =>
      (a.role === 'organizer' ? 0 : 1) - (b.role === 'organizer' ? 0 : 1) ||
      String(a.joined_at ?? '').localeCompare(String(b.joined_at ?? '')) ||
      a.coach_id.localeCompare(b.coach_id))
    if (others[0]) transferTeams.push({ teamId, toCoachId: others[0].coach_id })
    else deleteTeamIds.push(teamId)
  }
  const organizerAfter = (teamId: string): string | null => {
    const t = transferTeams.find(x => x.teamId === teamId)
    if (t) return t.toCoachId
    if (deleteTeamIds.includes(teamId)) return null
    const o = f.teamOrganizers[teamId]
    return o && o !== U ? o : null
  }

  // Who inherits a player's records once U is gone (null = no account left linked).
  const heir = (p: PlayerRow | undefined): string | null => {
    if (!p) return null
    if (p.user_id && p.user_id !== U) return p.user_id
    if (p.coach_id && p.coach_id !== U) return p.coach_id
    const g = p.guardian_id ? f.guardianUsers[p.guardian_id] : null
    if (g && g !== U) return g
    for (const t of f.playerTeamIds[p.id] ?? []) { const o = organizerAfter(t); if (o) return o }
    return null
  }

  const guardedPlayerIds = Object.values(f.players).filter(p => p.guardian_id && f.myGuardianIds.includes(p.guardian_id)).map(p => p.id)
  const linked = uniq([...f.coachedPlayerIds, ...guardedPlayerIds]).filter(id => !f.ownPlayerIds.includes(id))
  const orphaned = linked.filter(id => heir(f.players[id]) === null)
  const deletePlayerIds = uniq([...f.ownPlayerIds, ...orphaned])
  const deletedPlayer = new Set(deletePlayerIds)
  const detachCoachPlayerIds = f.coachedPlayerIds.filter(id => !deletedPlayer.has(id))

  // Clips U uploaded on players that stay
  const reassignClipPairs: [string, string][] = []
  const deleteClipIds: string[] = []
  for (const id of f.uploadedClipIds) {
    const c = f.clips[id]
    if (!c || deletedPlayer.has(c.player_id)) continue
    const h = heir(f.players[c.player_id])
    if (h) reassignClipPairs.push([h, id]); else deleteClipIds.push(id)
  }
  const clipGone = (clipId: string) => {
    const c = f.clips[clipId]
    return !c || deletedPlayer.has(c.player_id) || deleteClipIds.includes(clipId)
  }

  const reassignMetricPairs: [string, string][] = []
  const deleteMetricIds: string[] = []
  for (const m of f.authoredMetrics) {
    if (clipGone(m.clip_id)) continue
    const h = heir(f.players[f.clips[m.clip_id].player_id])
    if (h) reassignMetricPairs.push([h, m.id]); else deleteMetricIds.push(m.id)
  }
  const deleteAnnotationIds = f.authoredAnnotations.filter(a => !clipGone(a.clip_id)).map(a => a.id)
  const keptNotes = f.authoredNotes.filter(n => !clipGone(n.clip_id))
  const deleteNoteIds = keptNotes.map(n => n.id)

  // Storage: whole folders of deleted players / clips (listed first), plus exact known paths.
  const storageFolders: StorageTarget[] = []
  const storageFiles: StorageTarget[] = []
  for (const p of deletePlayerIds) for (const bucket of ['clips', 'lessons'] as const) storageFolders.push({ bucket, path: p })
  // Exact paths from rows; each must sit under its own clip's player folder.
  const underPlayer = (bucket: StorageTarget['bucket'], path: string | null | undefined, playerId: string) => {
    if (path && path.startsWith(`${playerId}/`) && isSafeStoragePath(path)) storageFiles.push({ bucket, path })
  }
  for (const id of deleteClipIds) {
    const c = f.clips[id]
    for (const bucket of ['clips', 'lessons'] as const) storageFolders.push({ bucket, path: `${c.player_id}/${c.id}` })
    underPlayer('clips', c.storage_path, c.player_id)
    underPlayer('clips', c.voice_path, c.player_id)
    underPlayer('lessons', c.lesson_path, c.player_id)
  }
  for (const n of keptNotes) {
    if (n.body?.startsWith(VOICE_PREFIX)) underPlayer('clips', n.body.slice(VOICE_PREFIX.length), f.clips[n.clip_id].player_id)
  }

  return {
    userId: U,
    email: f.email,
    transferTeams,
    deleteTeamIds,
    deleteAnnotationIds,
    deleteNoteIds,
    reassignMetrics: group(reassignMetricPairs),
    deleteMetricIds,
    reassignClips: group(reassignClipPairs),
    deleteClipIds,
    detachCoachPlayerIds,
    detachGuardianIds: f.myGuardianIds,
    deletePlayerIds,
    deleteGuardianIds: f.myGuardianIds,
    storageFolders,
    storageFiles,
    avatarOwner: U,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** A path under a player's UUID folder, with no traversal or odd characters. */
export function isSafeStoragePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false
  const seg = path.split('/')
  if (!UUID_RE.test(seg[0])) return false
  return seg.every(s => s !== '' && !s.includes('..') && SEGMENT_RE.test(s))
}

// ── Execute ──────────────────────────────────────────────────────────────────
async function listRecursive(storage: DeletionStorage, bucket: string, folder: string, depth = 0): Promise<string[]> {
  if (depth > 4) return []
  const r = await storage.list(bucket, folder)
  if (r.error) throw new AccountDeletionError(`list ${bucket}/${folder}`, r.error.message)
  const out = r.files.map(name => `${folder}/${name}`)
  for (const sub of r.folders) out.push(...await listRecursive(storage, bucket, `${folder}/${sub}`, depth + 1))
  return out
}

export type ExecuteResult = { removedFiles: number; log: string[] }

export async function executeDeletionPlan(db: DeletionDb, storage: DeletionStorage, plan: DeletionPlan, log: string[] = []): Promise<ExecuteResult> {
  const U = plan.userId
  if (!U) throw new AccountDeletionError('execute', 'no user id')

  // 1. Storage. List first, remove exact paths only, never a bare prefix.
  const files = new Map<string, Set<string>>()
  const add = (bucket: string, path: string) => { if (!files.has(bucket)) files.set(bucket, new Set()); files.get(bucket)!.add(path) }
  for (const t of plan.storageFolders) {
    if (!isSafeStoragePath(t.path)) throw new AccountDeletionError('storage', `unsafe folder ${t.path}`)
    for (const p of await listRecursive(storage, t.bucket, t.path)) if (isSafeStoragePath(p)) add(t.bucket, p)
  }
  for (const t of plan.storageFiles) add(t.bucket, t.path)
  const avatars = await storage.list('profiles', 'avatars', U)
  if (avatars.error) log.push(`skip avatar: ${avatars.error.message}`)
  else for (const name of avatars.files) if (name.startsWith(`${U}.`) && SEGMENT_RE.test(name)) add('profiles', `avatars/${name}`)
  let removedFiles = 0
  for (const [bucket, set] of files) {
    for (const part of chunks([...set])) {
      const r = await storage.remove(bucket, part)
      if (r.error) throw new AccountDeletionError(`remove files from ${bucket}`, r.error.message)
      removedFiles += part.length
    }
  }

  // 2. Database, FK-safe order.
  type Step = { name: string; optional?: 'column'; run: () => Promise<{ error?: DbError | null }> }
  const steps: Step[] = []
  const del = (table: string, column: string, ids: string[], name = `delete ${table}`) => {
    for (const part of chunks(uniq(ids))) steps.push({ name, run: () => db.delete(table, { [column]: part }) })
  }
  const upd = (table: string, set: Row, column: string, ids: string[], name: string, optional?: 'column') => {
    for (const part of chunks(uniq(ids))) steps.push({ name, optional, run: () => db.update(table, set, { [column]: part }) })
  }

  for (const t of plan.transferTeams) {
    steps.push({ name: 'transfer team', run: () => db.update('teams', { coach_id: t.toCoachId }, { id: [t.teamId], coach_id: [U] }) })
    steps.push({ name: 'promote team coach', run: () => db.update('team_coaches', { role: 'organizer' }, { team_id: [t.teamId], coach_id: [t.toCoachId] }) })
  }
  upd('players', { team_id: null }, 'team_id', plan.deleteTeamIds, 'detach players from deleted teams')
  del('teams', 'id', plan.deleteTeamIds)
  del('annotations', 'id', plan.deleteAnnotationIds)
  del('timestamp_notes', 'id', plan.deleteNoteIds)
  for (const g of plan.reassignMetrics) upd('pitch_metrics', { created_by: g.to }, 'id', g.ids, 'reassign metrics')
  del('pitch_metrics', 'id', plan.deleteMetricIds)
  for (const g of plan.reassignClips) upd('clips', { uploaded_by: g.to }, 'id', g.ids, 'reassign clips')
  del('clips', 'id', plan.deleteClipIds)
  upd('players', { coach_id: null }, 'id', plan.detachCoachPlayerIds, 'detach coach from players')
  upd('players', { guardian_id: null }, 'guardian_id', plan.detachGuardianIds, 'detach guardian from players')
  del('players', 'id', plan.deletePlayerIds)
  steps.push({ name: 'clear guardians.created_by', optional: 'column', run: () => db.update('guardians', { created_by: null }, { created_by: [U] }) })
  del('guardians', 'id', plan.deleteGuardianIds)
  steps.push({ name: 'delete team_coaches', run: () => db.delete('team_coaches', { coach_id: [U] }) })
  if (plan.email) {
    const emails = uniq([plan.email, plan.email.trim().toLowerCase()])
    steps.push({ name: 'delete waitlist', run: () => db.delete('waitlist', { email: emails }) })
  }

  for (const s of steps) {
    const { error } = await s.run()
    if (!error) continue
    if (isMissingRelation(error)) { log.push(`skip ${s.name}: table missing`); continue }
    if (s.optional === 'column' && isMissingColumn(error)) { log.push(`skip ${s.name}: column missing`); continue }
    throw new AccountDeletionError(s.name, error.message)
  }
  return { removedFiles, log }
}

// ── Whole flow (used by the deleteAccount server action) ─────────────────────
export type DeleteFlowResult =
  | { ok: true; plan: DeletionPlan; removedFiles: number; log: string[] }
  | { ok: false; error: string; step: string; detail: string }

/**
 * Clean up, then delete the auth user. Never reports success unless every step,
 * including deleteAuthUser, succeeded. A missing user id is refused outright.
 */
export async function deleteAccountFlow(deps: {
  userId: string | null | undefined
  email: string | null | undefined
  db: DeletionDb
  storage: DeletionStorage
  deleteAuthUser: (id: string) => Promise<{ error?: { message: string } | null }>
}): Promise<DeleteFlowResult> {
  const { userId } = deps
  if (!userId) return { ok: false, step: 'session', detail: 'no user', error: 'Your session has expired. Sign in again, then try deleting your account.' }
  let plan: DeletionPlan
  let result: ExecuteResult
  try {
    const facts = await gatherDeletionFacts(deps.db, userId, deps.email ?? null)
    plan = planAccountDeletion(facts)
    result = await executeDeletionPlan(deps.db, deps.storage, plan, facts.log)
  } catch (e) {
    const step = e instanceof AccountDeletionError ? e.step : 'clean up your data'
    const detail = e instanceof AccountDeletionError ? e.detail : e instanceof Error ? e.message : String(e)
    return {
      ok: false, step, detail,
      error: `We couldn't delete your account (failed at: ${step}). You're still signed in and your login still works. Some of your data may already have been removed. Please try again, or contact support if this keeps happening.`,
    }
  }
  let authError: { message: string } | null | undefined
  try {
    authError = (await deps.deleteAuthUser(userId)).error
  } catch (e) {
    authError = { message: e instanceof Error ? e.message : String(e) }
  }
  if (authError) {
    return {
      ok: false, step: 'delete login', detail: authError.message,
      error: 'Your data was removed, but we couldn\'t delete your login. You\'re still signed in. Please try again, or contact support.',
    }
  }
  return { ok: true, plan, removedFiles: result.removedFiles, log: result.log }
}
