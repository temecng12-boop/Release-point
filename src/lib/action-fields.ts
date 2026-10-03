// Server action arguments come from the browser and can contain anything.
// Actions that write with the service role keep only the columns they allow,
// with a basic type check, and set ids/ownership columns themselves.

export type FieldKind = 'text' | 'int' | 'textList' | 'json'
export type FieldSpec = Record<string, FieldKind>

const MAX_TEXT = 5000
const MAX_LIST = 100
const MAX_JSON = 50_000

export const INVALID_FIELDS = 'Some of these details couldn\'t be saved. Check the fields and try again.'

function valid(kind: FieldKind, v: unknown): boolean {
  if (v === null) return true
  switch (kind) {
    case 'text': return typeof v === 'string' && v.length <= MAX_TEXT
    case 'int': return typeof v === 'number' && Number.isInteger(v)
    case 'textList': return Array.isArray(v) && v.length <= MAX_LIST && v.every(x => typeof x === 'string' && x.length <= MAX_TEXT)
    case 'json': {
      if (typeof v !== 'object') return false
      try { return JSON.stringify(v).length <= MAX_JSON } catch { return false }
    }
  }
}

/**
 * Keep only the fields in `spec`; unknown keys are dropped and undefined
 * values skipped. A known field with the wrong type refuses the whole write.
 */
export function pickFields(data: unknown, spec: FieldSpec): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: INVALID_FIELDS }
  const fields: Record<string, unknown> = {}
  for (const [key, kind] of Object.entries(spec)) {
    const v = (data as Record<string, unknown>)[key]
    if (v === undefined) continue
    if (!valid(kind, v)) return { ok: false, error: INVALID_FIELDS }
    fields[key] = v
  }
  return { ok: true, fields }
}

/** profiles columns a user may change on their own profile (updateProfile). Never role, avatar_url or id. */
export const OWN_PROFILE_FIELDS: FieldSpec = {
  full_name: 'text', team_name: 'text', bio: 'text', playing_career: 'text', coaching_since: 'int',
  certifications: 'textList', location: 'text', social_twitter: 'text', social_instagram: 'text', social_linkedin: 'text',
}

/** players columns for the athlete profile (coach or the player). */
export const ATHLETE_PROFILE_FIELDS: FieldSpec = {
  college_interests: 'textList', college_offers: 'textList', showcases: 'json', career_stats: 'json',
}

/** players columns a player may change on their own row (updatePlayerSelfProfile).
 *  Never coach_id, user_id, guardian_id, team_id or consent/18+ columns. */
export const PLAYER_SELF_FIELDS: FieldSpec = {
  full_name: 'text', height: 'text', weight: 'text', high_school: 'text', travel_team: 'text',
  graduation_year: 'int', throws: 'text', bats: 'text', ...ATHLETE_PROFILE_FIELDS,
}
