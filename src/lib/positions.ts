// Player positions are a multi-select of these six tags. The old
// players.position column (pitcher | hitter) stays in place so a
// deploy-before-paste or paste-before-deploy still works.
import type { DbErrorLike } from './db-errors'
import { isMissingColumnError } from './db-errors'

export const PLAYER_POSITIONS = ['pitcher', 'hitter', 'catcher', 'infield', 'outfield', 'two-way'] as const
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number]

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  pitcher: 'Pitcher',
  hitter: 'Hitter',
  catcher: 'Catcher',
  infield: 'Infield',
  outfield: 'Outfield',
  'two-way': 'Two-way',
}

export const INVALID_POSITIONS = 'Choose a valid position.'

const POSITION_SET = new Set<string>(PLAYER_POSITIONS)

export function isPlayerPosition(v: unknown): v is PlayerPosition {
  return typeof v === 'string' && POSITION_SET.has(v)
}

/** Every value the app has written to players.position, plus two-way spellings testers used. */
const LEGACY_POSITION_MAP: Record<string, PlayerPosition[]> = {
  pitcher: ['pitcher'],
  hitter: ['hitter'],
  p: ['pitcher'],
  rhp: ['pitcher'],
  lhp: ['pitcher'],
  sp: ['pitcher'],
  rp: ['pitcher'],
  cp: ['pitcher'],
  'pitcher+hitter': ['two-way'],
  'pitcher + hitter': ['two-way'],
  'hitter+pitcher': ['two-way'],
  'hitter + pitcher': ['two-way'],
  'two-way': ['two-way'],
  two_way: ['two-way'],
  twoway: ['two-way'],
  both: ['two-way'],
  catcher: ['catcher'],
  c: ['catcher'],
  infield: ['infield'],
  infielder: ['infield'],
  inf: ['infield'],
  outfield: ['outfield'],
  outfielder: ['outfield'],
  of: ['outfield'],
}

function unique(list: PlayerPosition[]): PlayerPosition[] {
  const out: PlayerPosition[] = []
  for (const p of list) if (!out.includes(p)) out.push(p)
  return out
}

/** Map a single stored players.position value (any historical spelling) to the six tags. */
export function mapLegacyPosition(value: string | null | undefined): PlayerPosition[] {
  if (value == null) return []
  const raw = value.trim().toLowerCase()
  if (!raw) return []
  if (LEGACY_POSITION_MAP[raw]) return [...LEGACY_POSITION_MAP[raw]]
  if (raw.includes('pitcher') && raw.includes('hitter')) return ['two-way']
  if (isPlayerPosition(raw)) return [raw]
  if (raw.includes('pitcher')) return ['pitcher']
  if (raw.includes('hitter') || raw.includes('batter')) return ['hitter']
  if (raw.includes('catch')) return ['catcher']
  if (raw.includes('infield')) return ['infield']
  if (raw.includes('outfield')) return ['outfield']
  if (raw.includes('two') && raw.includes('way')) return ['two-way']
  return []
}

/** Accept a form/JSON value; refuse unknown tags so a bad write is an error, not a silent drop. */
export function parsePositionsInput(raw: unknown): { ok: true; positions: PlayerPosition[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, positions: [] }
  const list = Array.isArray(raw) ? raw : [raw]
  const out: PlayerPosition[] = []
  for (const item of list) {
    if (typeof item !== 'string') return { ok: false, error: INVALID_POSITIONS }
    const v = item.trim().toLowerCase()
    if (!v) continue
    if (!isPlayerPosition(v)) return { ok: false, error: INVALID_POSITIONS }
    if (!out.includes(v)) out.push(v)
  }
  return { ok: true, positions: out }
}

export type PositionSource = {
  position?: string | null
  positions?: unknown
}

/**
 * Read the multi-value list. `positions` missing/undefined falls back to the
 * old column; null or [] means none selected (valid).
 */
export function resolvePlayerPositions(row: PositionSource | null | undefined): PlayerPosition[] {
  if (!row) return []
  if (row.positions !== undefined && row.positions !== null) {
    const parsed = parsePositionsInput(row.positions)
    return parsed.ok ? parsed.positions : mapLegacyPosition(row.position)
  }
  return mapLegacyPosition(row.position)
}

/** Value written back to the old CHECK (pitcher | hitter) column. */
export function legacyPositionFrom(positions: readonly PlayerPosition[]): 'pitcher' | 'hitter' | null {
  if (positions.includes('hitter') && !positions.includes('pitcher') && !positions.includes('two-way')) return 'hitter'
  if (positions.includes('pitcher') || positions.includes('two-way')) return 'pitcher'
  return null
}

export type ClipKind = 'pitching' | 'hitting'

export function isClipKind(v: unknown): v is ClipKind {
  return v === 'pitching' || v === 'hitting'
}

/** Hitter only → hitting; anything else (including none) → pitching. */
export function defaultClipKind(positions: readonly PlayerPosition[]): ClipKind {
  return positions.length === 1 && positions[0] === 'hitter' ? 'hitting' : 'pitching'
}

export function resolveClipKind(clipKind: unknown, positions: readonly PlayerPosition[]): ClipKind {
  return isClipKind(clipKind) ? clipKind : defaultClipKind(positions)
}

export function formatPositionLabels(positions: readonly PlayerPosition[]): string {
  return positions.map((p) => POSITION_LABELS[p]).join(', ')
}

export function positionSearchText(row: PositionSource | null | undefined): string {
  const tags = resolvePlayerPositions(row)
  return unique([...tags, ...mapLegacyPosition(row?.position)]).map((p) => POSITION_LABELS[p]).join(' ').toLowerCase()
}

/**
 * Write `positions` plus a compatible `position`. If the new column is
 * missing (deploy-before-paste), retry with only the old column.
 */
export async function writeWithPositions<R extends { error: DbErrorLike | null }>(
  fields: Record<string, unknown>,
  positions: PlayerPosition[] | undefined,
  run: (fields: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
  if (positions === undefined) return run(fields)
  const payload = { ...fields, positions, position: legacyPositionFrom(positions) }
  const first = await run(payload)
  if (!isMissingColumnError(first.error, 'positions')) return first
  return run({ ...fields, position: legacyPositionFrom(positions) })
}
