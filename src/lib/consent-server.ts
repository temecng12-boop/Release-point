// Server-side checks for the player video rule and age bands (RP-041,
// migration 037). See ./consent.ts for the rule and ./age-band.ts for bands.
//
// The Supabase client is passed in (the service-role client in app code) so
// these functions can be unit tested with a fake client. Only call them from
// Server Actions, Route Handlers or Server Components.
//
// Age answers are written only here, with the service role, after the
// caller's authorization is checked: 037's players_restrict_update /
// players_restrict_insert refuse them from end users (coaches included).
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlayersOwnCoach } from './auth/roster-access'
import { isMissingColumnError, type DbErrorLike } from './db-errors'
import { effectiveAgeBand, type AgeBandSource } from './age-band'
import {
  AGE_BAND_MIGRATION_COLUMNS,
  canSelfConfirmAgeBand,
  canUploadVideo,
  CONSENT_MIGRATION_COLUMNS,
  isAgeBand,
  pendingReason,
  PLAYER_CONSENT_COLUMNS,
  PLAYER_CONSENT_COLUMNS_023,
  UPLOAD_BLOCKED_MESSAGE,
  uploadBlockedText,
  type AgeBand,
  type PlayerConsentFields,
} from './consent'

type Db = Pick<SupabaseClient, 'from'>

export type ConsentCheck = { ok: true } | { ok: false; error: string }

// ── Before migrations 023 / 037 ──────────────────────────────────────────────
// Until 023 runs, players.adult_confirmed_at / adult_confirmed_by don't exist
// and any query naming them fails (Postgres 42703, PostgREST PGRST204). The
// code then falls back to how the app behaved before the consent rule:
// uploads are not gated, and no player counts as confirmed 18+.
// Until 037 runs, the age columns don't exist: the code then uses 023's rule
// (18+ confirmation or consent_given_at), the same as 023's trigger.

/** True if `error` is "column does not exist" for one of 023's columns. */
export function isMissingConsentColumn(error: DbErrorLike | null | undefined): boolean {
  return CONSENT_MIGRATION_COLUMNS.some((c) => isMissingColumnError(error, c))
}

/** True if `error` is "column does not exist" for one of 037's columns. */
export function isMissingAgeBandColumn(error: DbErrorLike | null | undefined): boolean {
  return AGE_BAND_MIGRATION_COLUMNS.some((c) => isMissingColumnError(error, c))
}

const warned = new Set<string>()
function warnOnce(context: string, migration: '023' | '037') {
  if (warned.has(migration)) return
  warned.add(migration)
  console.warn(migration === '023'
    ? `[${context}] players.adult_confirmed_at not found: migration 023 not applied yet, so the video consent rule is off`
    : `[${context}] players.age_band not found: migration 037 not applied yet, so 023's 18+/consent rule applies`)
}

type QueryResult = { data: unknown; error: DbErrorLike | null }

function markRows(data: unknown, flags: Record<string, unknown>) {
  const mark = (row: unknown) =>
    row && typeof row === 'object' ? { ...(row as Record<string, unknown>), ...flags } : row
  return Array.isArray(data) ? data.map(mark) : mark(data)
}

const NO_AGE = { age_band: null, age_confirmed_at: null, age_band_coach: null, age_band_self: null, age_screen_at: null }

/**
 * Runs a players select with `columns` plus the consent columns. If 037's
 * columns are missing, runs it again with 023's (rows marked
 * `age_band_pending_migration`); if 023's are missing too, with only
 * consent_given_at (rows marked `consent_rules_pending_migration`).
 * Works for single-row and list queries.
 */
export async function selectPlayersWithConsent<T>(
  columns: string,
  run: (select: string) => PromiseLike<QueryResult>,
): Promise<{ data: T | null; error: DbErrorLike | null }> {
  const first = await run(`${columns}, ${PLAYER_CONSENT_COLUMNS}`)
  if (!isMissingAgeBandColumn(first.error) && !isMissingConsentColumn(first.error)) {
    return first as { data: T | null; error: DbErrorLike | null }
  }
  if (isMissingAgeBandColumn(first.error)) {
    warnOnce('selectPlayersWithConsent', '037')
    const second = await run(`${columns}, ${PLAYER_CONSENT_COLUMNS_023}`)
    if (!isMissingConsentColumn(second.error)) {
      if (second.error) return second as { data: T | null; error: DbErrorLike | null }
      return { data: markRows(second.data, { ...NO_AGE, age_band_pending_migration: true }) as T | null, error: null }
    }
  }
  warnOnce('selectPlayersWithConsent', '023')
  const retry = await run(`${columns}, consent_given_at`)
  if (retry.error) return retry as { data: T | null; error: DbErrorLike | null }
  return {
    data: markRows(retry.data, {
      adult_confirmed_at: null, ...NO_AGE,
      consent_rules_pending_migration: true, age_band_pending_migration: true,
    }) as T | null,
    error: null,
  }
}

/**
 * Runs a players write that includes `adultFields` (023's columns). If those
 * columns don't exist yet, runs it again without them, so signup and invites
 * still work before 023.
 */
export async function writeWithAdultFields<R extends QueryResult>(
  adultFields: Record<string, unknown>,
  run: (fields: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
  const first = await run(adultFields)
  if (Object.keys(adultFields).length === 0 || !isMissingConsentColumn(first.error)) return first
  warnOnce('writeWithAdultFields', '023')
  return run({})
}

/**
 * Runs a players write with 037's age fields and 023's adult fields. Before
 * 037 it runs again with only the adult fields; before 023 with neither.
 * `bandSaved` says whether the age answer was stored.
 */
export async function writeWithAgeFields<R extends QueryResult>(
  ageFields: Record<string, unknown>,
  adultFields: Record<string, unknown>,
  run: (fields: Record<string, unknown>) => PromiseLike<R>,
): Promise<{ result: R; bandSaved: boolean }> {
  const hasAge = Object.keys(ageFields).length > 0
  const first = await run({ ...ageFields, ...adultFields })
  if (hasAge && isMissingAgeBandColumn(first.error)) {
    warnOnce('writeWithAgeFields', '037')
    return { result: await writeWithAdultFields(adultFields, run), bandSaved: false }
  }
  if (isMissingConsentColumn(first.error)) {
    warnOnce('writeWithAgeFields', '023')
    return { result: await run({}), bandSaved: false }
  }
  return { result: first, bandSaved: hasAge && !first.error }
}

export type AgeAnswers = { coach?: string | null; self?: string | null; ageGroups?: (string | null | undefined)[] }

/**
 * The players fields for a new coach or player answer, with the effective
 * band worked out the same way as 037's trigger (which recomputes it anyway):
 *   age: age_band_coach | age_band_self (+ age_screen_at for the player),
 *        age_band, age_band_source, age_confirmed_at/by
 *   adult: 023's adult_confirmed_at/by, kept in step (set for 18_plus only)
 */
export function ageAnswerFields(
  who: 'coach' | 'self',
  band: AgeBand | null,
  actorId: string,
  current: AgeAnswers & { coachId?: string | null; userId?: string | null } = {},
  now = new Date().toISOString(),
): { age: Record<string, unknown>; adult: Record<string, unknown>; band: AgeBand | null; source: AgeBandSource | null } {
  const answers = { coach: current.coach ?? null, self: current.self ?? null, ageGroups: current.ageGroups ?? [] }
  if (who === 'coach') answers.coach = band
  else answers.self = band
  const eff = effectiveAgeBand(answers)
  const deciderId = eff.source === 'coach' ? (who === 'coach' ? actorId : current.coachId ?? null)
    : eff.source === 'self' ? (who === 'self' ? actorId : current.userId ?? null)
    : null
  const age: Record<string, unknown> = {
    ...(who === 'coach' ? { age_band_coach: band } : { age_band_self: band, age_screen_at: now }),
    age_band: eff.band,
    age_band_source: eff.source,
    age_confirmed_at: eff.band ? now : null,
    age_confirmed_by: eff.band ? deciderId : null,
  }
  const adult = eff.band === '18_plus'
    ? { adult_confirmed_at: now, adult_confirmed_by: deciderId }
    : { adult_confirmed_at: null, adult_confirmed_by: null }
  return { age, adult, band: eff.band, source: eff.source }
}

/** Age groups of the teams with these ids (players.team_id and player_teams). */
export async function teamAgeGroups(db: Db, teamIds: (string | null | undefined)[]): Promise<(string | null)[]> {
  const ids = [...new Set(teamIds.filter((t): t is string => !!t))]
  if (ids.length === 0) return []
  const { data } = await db.from('teams').select('age_group').in('id', ids)
  return ((data as { age_group: string | null }[] | null) ?? []).map((t) => t.age_group)
}

/** The player's own and team age groups (younger-band rule input). */
export async function playerAgeGroups(db: Db, player: { id: string; age_group?: string | null; team_id?: string | null }): Promise<(string | null)[]> {
  const { data: links } = await db.from('player_teams').select('team_id').eq('player_id', player.id)
  const teamIds = [player.team_id, ...(((links as { team_id: string }[] | null) ?? []).map((l) => l.team_id))]
  return [player.age_group ?? null, ...(await teamAgeGroups(db, teamIds))]
}

/**
 * Refuses media uploads for a player who may not have video yet (see
 * consent.ts for the rule). Fails closed if the status can't be read, except
 * before migration 023 (see above), when uploads are allowed as before.
 */
export async function checkUploadConsent(db: Db, playerId: string): Promise<ConsentCheck> {
  const { data, error } = await selectPlayersWithConsent<PlayerConsentFields & { id: string }>(
    'id',
    (cols) => db.from('players').select(cols).eq('id', playerId).maybeSingle(),
  )
  if (error) {
    console.error('[checkUploadConsent] could not read consent status', playerId, error.message)
    return { ok: false, error: 'Could not check consent status for this player.' }
  }
  if (!data) return { ok: false, error: 'Player not found' }
  if (!canUploadVideo(data)) return { ok: false, error: UPLOAD_BLOCKED_MESSAGE }
  return { ok: true }
}

/**
 * True if `userId` may change a player's age band / 18+ status: only the
 * player's own coach. A player with no coach set cannot be changed by any coach.
 */
export async function canManagePlayerAge(db: Db, userId: string, playerId: string): Promise<boolean> {
  const { data: player } = await db
    .from('players')
    .select('coach_id')
    .eq('id', playerId)
    .maybeSingle()
  return isPlayersOwnCoach(userId, player as { coach_id: string | null } | null)
}

const NOT_AVAILABLE_BAND = "Setting an age band isn't available yet: a database update still needs to be applied."
const NOT_AVAILABLE_ADULT = "Marking players 18+ isn't available yet: a database update still needs to be applied."

export type SetBandResult = { success: true; band: AgeBand | null; youngerKept?: boolean } | { error: string }

/**
 * The player's coach records their band answer (null clears it). The stored
 * band is the younger of the coach's and the player's answers and any
 * under-13 age group; `youngerKept` says a younger answer won over the
 * coach's. Only the player's own coach (players.coach_id); checked first.
 */
export async function setCoachAgeBand(db: Db, userId: string, playerId: string, band: AgeBand | null): Promise<SetBandResult> {
  if (band !== null && !isAgeBand(band)) return { error: 'Choose an age band.' }
  if (!(await canManagePlayerAge(db, userId, playerId))) return { error: 'Not authorized' }
  const what = band === null || band === '18_plus' ? "the player's 18+ status" : "the player's age band"

  type Row = { id: string; coach_id: string | null; user_id: string | null; age_group: string | null; team_id: string | null; age_band_self?: string | null }
  const read = await db.from('players').select('id, coach_id, user_id, age_group, team_id, age_band_self').eq('id', playerId).maybeSingle()
  if (isMissingAgeBandColumn(read.error)) {
    // Before 037: only 18+ (or clearing it) can be stored, in 023's columns.
    warnOnce('setCoachAgeBand', '037')
    if (band !== null && band !== '18_plus') return { error: NOT_AVAILABLE_BAND }
    const now = new Date().toISOString()
    const adult = band ? { adult_confirmed_at: now, adult_confirmed_by: userId } : { adult_confirmed_at: null, adult_confirmed_by: null }
    const { error } = await db.from('players').update(adult).eq('id', playerId).eq('coach_id', userId)
    if (isMissingConsentColumn(error)) return { error: NOT_AVAILABLE_ADULT }
    if (error) {
      console.error('[setCoachAgeBand] update failed', { playerId, code: error.code ?? null, message: error.message })
      return { error: `Couldn't save ${what}. Please try again.` }
    }
    return { success: true, band }
  }
  if (read.error || !read.data) {
    if (read.error) console.error('[setCoachAgeBand] read failed', { playerId, code: read.error.code ?? null, message: read.error.message })
    return { error: `Couldn't save ${what}. Please try again.` }
  }
  const row = read.data as Row
  const fields = ageAnswerFields('coach', band, userId, {
    self: row.age_band_self ?? null,
    ageGroups: await playerAgeGroups(db, row),
    userId: row.user_id,
  })
  const { data: saved, error } = await db.from('players').update({ ...fields.age, ...fields.adult })
    .eq('id', playerId).eq('coach_id', userId).select('age_band')
  if (error || !Array.isArray(saved) || saved.length !== 1) {
    console.error('[setCoachAgeBand] update failed', { playerId, code: error?.code ?? null, message: error?.message ?? 'no row updated' })
    return { error: `Couldn't save ${what}. Please try again.` }
  }
  const stored = ((saved[0] as { age_band?: string | null }).age_band ?? fields.band) as AgeBand | null
  return { success: true, band: stored, youngerKept: band !== null && stored !== band }
}

/** Marks (or unmarks) a player as 18+: the coach's '18_plus' answer (or none). */
export async function setAdultConfirmation(db: Db, userId: string, playerId: string, confirmed: boolean): Promise<SetBandResult> {
  return setCoachAgeBand(db, userId, playerId, confirmed ? '18_plus' : null)
}

/**
 * The friendly "can't add video yet" error for an upload by `userId`: the
 * player's own wording (with what to do next) if they are the player, the
 * coach's otherwise.
 */
export async function uploadBlockedMessageFor(db: Db, playerId: string, userId: string): Promise<string> {
  type Row = PlayerConsentFields & { user_id: string | null; coach_id: string | null; guardian_id: string | null }
  const { data: row } = await selectPlayersWithConsent<Row>(
    'user_id, coach_id, guardian_id',
    (cols) => db.from('players').select(cols).eq('id', playerId).maybeSingle(),
  )
  const reason = pendingReason(row) ?? 'age_band'
  if (row?.user_id && row.user_id === userId) {
    return uploadBlockedText('player', { reason, selfConfirm: canSelfConfirmAgeBand(row) })
  }
  return uploadBlockedText('coach', { reason })
}

export const SELF_CONFIRM_FAILED = 'We couldn\'t save your answer. Please try again.'
export const ALREADY_ANSWERED = "You've already answered. Only your coach can change your age."
const NOT_AVAILABLE_SELF = "Confirming your age isn't available yet: a database update still needs to be applied."

export type OwnAnswerResult = { success: true; band: AgeBand | null } | { error: string }

/**
 * Stores the signed-in player's own age answer (from the birth month/year
 * screen; the month and year are not passed here and never stored). One
 * answer per player:
 *   * a coach-invited player: their first-sign-in age screen;
 *   * a player with no coach: the one-time confirm, only while no band is on
 *     file and no guardian is on file (see canSelfConfirmAgeBand).
 * The stored band is the younger of this answer, the coach's and any
 * under-13 age group. Success only after exactly that row was updated.
 * Before 037 only a coachless 18+ answer can be stored (023's columns).
 */
export async function recordOwnAgeAnswer(db: Db, userId: string, band: AgeBand): Promise<OwnAnswerResult> {
  if (!isAgeBand(band)) return { error: 'Enter your birth month and year.' }
  type Row = PlayerConsentFields & { id: string; user_id: string | null; coach_id: string | null; guardian_id: string | null; age_group: string | null; team_id: string | null }
  const { data, error } = await selectPlayersWithConsent<Row>(
    'id, user_id, coach_id, guardian_id, age_group, team_id',
    (cols) => db.from('players').select(cols).eq('user_id', userId).maybeSingle(),
  )
  if (error) {
    console.error('[recordOwnAgeAnswer] read failed', { userId, message: error.message })
    return { error: SELF_CONFIRM_FAILED }
  }
  const row = data
  if (!row) return { error: 'Player profile not found.' }

  if (row.age_band_pending_migration) {
    if (row.consent_rules_pending_migration || band !== '18_plus' || row.coach_id || row.guardian_id) return { error: NOT_AVAILABLE_SELF }
    if (row.adult_confirmed_at) return { success: true, band: '18_plus' }
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await db.from('players')
      .update({ adult_confirmed_at: now, adult_confirmed_by: userId })
      .eq('id', row.id).eq('user_id', userId).is('coach_id', null).is('guardian_id', null).is('adult_confirmed_at', null)
      .select('id')
    if (updateError || !Array.isArray(updated) || updated.length !== 1) {
      console.error('[recordOwnAgeAnswer] 023 update failed', { userId, message: updateError?.message ?? 'no row updated' })
      return { error: SELF_CONFIRM_FAILED }
    }
    return { success: true, band: '18_plus' }
  }

  if (row.age_screen_at || row.age_band_self) return { error: ALREADY_ANSWERED }
  if (!row.coach_id) {
    if (row.guardian_id) return { error: 'A guardian is on file for your account. Ask your coach.' }
    if (!canSelfConfirmAgeBand(row)) return { error: ALREADY_ANSWERED }
  }

  const fields = ageAnswerFields('self', band, userId, {
    coach: row.age_band_coach ?? null,
    ageGroups: await playerAgeGroups(db, row),
    coachId: row.coach_id,
  })
  let q = db.from('players').update({ ...fields.age, ...fields.adult })
    .eq('id', row.id).eq('user_id', userId).is('age_screen_at', null).is('age_band_self', null)
  if (!row.coach_id) q = q.is('coach_id', null).is('guardian_id', null).is('age_band_coach', null)
  const { data: updated, error: updateError } = await q.select('age_band')
  if (updateError || !Array.isArray(updated) || updated.length !== 1) {
    console.error('[recordOwnAgeAnswer] update failed', { userId, playerId: row.id, message: updateError?.message ?? 'no row updated' })
    return { error: SELF_CONFIRM_FAILED }
  }
  return { success: true, band: ((updated[0] as { age_band?: string | null }).age_band ?? fields.band) as AgeBand | null }
}
