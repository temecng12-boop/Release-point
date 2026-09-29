// Ownership checks for signed storage URLs (clips and lessons buckets).
//
// Every path the app creates starts with the player's id:
//   clips:   <playerId>/<timestamp>[-<rand>].<ext>          (clip uploads)
//            <playerId>/<clipId>/voice.<ext>                  (clip voice note)
//            <playerId>/<clipId>/ts_voice/<uid>.<ext>         (timestamp voice notes)
//   lessons: <playerId>/<clipId>/lesson.<ext>                 (lesson recordings)
// so the first folder maps the path to its player. Access then follows
// canViewPlayerContent (src/lib/clip-access.ts):
//   read:  the player, direct coach, linked guardian, or team coach
//   write: the player's direct coach or team coach; the player themself for
//          the clips bucket (self-upload). Guardians never write. Lessons are
//          coach-only.
// Team access is skipped (not an error) if team_coaches / player_teams can't
// be read, e.g. migration 018 not applied.
import { canViewPlayerContent, teamCoachAccess, type AccessDb } from './clip-access'

export type StorageBucket = 'clips' | 'lessons'
export type StorageMode = 'read' | 'write'

const BUCKETS: readonly StorageBucket[] = ['clips', 'lessons']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_PATH_LENGTH = 512

export type ParsedPath = { ok: true; playerId: string } | { ok: false; reason: string }

/**
 * Validate a storage path and return the player it belongs to. Rejects
 * traversal ("..", "."), absolute or empty segments, backslashes, encoded or
 * unusual characters, unknown prefixes (first folder must be a player UUID),
 * and bare "<playerId>" with no file.
 */
export function parseStoragePath(path: unknown): ParsedPath {
  if (typeof path !== 'string' || path.length === 0) return { ok: false, reason: 'empty path' }
  if (path.length > MAX_PATH_LENGTH) return { ok: false, reason: 'path too long' }
  const segments = path.split('/')
  if (segments.length < 2) return { ok: false, reason: 'no player folder' }
  for (const s of segments) {
    if (s === '' ) return { ok: false, reason: 'empty segment' }
    if (s === '.' || s === '..' || s.includes('..')) return { ok: false, reason: 'traversal' }
    if (!SEGMENT_RE.test(s)) return { ok: false, reason: 'invalid characters' }
  }
  if (!UUID_RE.test(segments[0])) return { ok: false, reason: 'unknown prefix' }
  return { ok: true, playerId: segments[0].toLowerCase() }
}

export function isStorageBucket(bucket: unknown): bucket is StorageBucket {
  return typeof bucket === 'string' && (BUCKETS as readonly string[]).includes(bucket)
}

export type StorageDecision =
  | { allowed: true; playerId: string; via: string; teamCheck: 'ok' | 'unavailable' | 'skipped' }
  | { allowed: false; reason: string; teamCheck: 'ok' | 'unavailable' | 'skipped' }

/**
 * Decide whether userId may read or write `path` in `bucket`. `client` is the
 * service-role Supabase client (or a test fake); the owner is always compared
 * against userId, and a missing userId never matches.
 */
export async function decideStorageAccess(
  client: unknown,
  userId: string | null | undefined,
  bucket: unknown,
  path: unknown,
  mode: StorageMode,
): Promise<StorageDecision> {
  if (!userId) return { allowed: false, reason: 'not signed in', teamCheck: 'skipped' }
  if (!isStorageBucket(bucket)) return { allowed: false, reason: 'unknown bucket', teamCheck: 'skipped' }
  const parsed = parseStoragePath(path)
  if (!parsed.ok) return { allowed: false, reason: parsed.reason, teamCheck: 'skipped' }

  const access = await canViewPlayerContent(client, userId, parsed.playerId)
  if (!access.allowed) return { allowed: false, reason: 'no access to player', teamCheck: access.teamCheck }
  if (mode === 'read') return { allowed: true, playerId: parsed.playerId, via: access.via, teamCheck: access.teamCheck }

  // write
  if (access.via === 'coach' || access.via === 'team_coach') {
    return { allowed: true, playerId: parsed.playerId, via: access.via, teamCheck: access.teamCheck }
  }
  if (access.via === 'player') {
    if (bucket === 'clips') return { allowed: true, playerId: parsed.playerId, via: 'player', teamCheck: access.teamCheck }
    return { allowed: false, reason: 'lessons are coach-only', teamCheck: access.teamCheck }
  }
  // Guardians can't write, unless they are also a coach on the player's team.
  const { data: player } = await (client as AccessDb).from('players').select('team_id').eq('id', parsed.playerId).maybeSingle()
  const team = await teamCoachAccess(client as AccessDb, userId, parsed.playerId, (player as { team_id: string | null } | null)?.team_id ?? null)
  if (team === 'yes') return { allowed: true, playerId: parsed.playerId, via: 'team_coach', teamCheck: 'ok' }
  return { allowed: false, reason: 'read-only access', teamCheck: team === 'unavailable' ? 'unavailable' : 'ok' }
}
