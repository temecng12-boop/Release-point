// Server-side checks for the player video consent rule (RP-041, age bands 035).
//
// The Supabase client is passed in (the service-role client in app code) so
// these functions can be unit tested with a mocked client. Only call them from
// Server Actions, Route Handlers or Server Components.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlayersOwnCoach } from './auth/roster-access'
import { isMissingColumnError, type DbErrorLike } from './db-errors'
import { maskEmail } from './guardian-email'
import {
  AGE_BAND_MIGRATION_COLUMNS,
  canUploadVideo,
  CONSENT_MIGRATION_COLUMNS,
  isAgeBand,
  pendingReason,
  PLAYER_CONSENT_COLUMNS,
  PLAYER_CONSENT_COLUMNS_023,
  UPLOAD_BLOCKED_MESSAGE,
  uploadBlockedText,
  type AgeBand,
  type GuardianNotice,
  type PlayerConsentFields,
} from './consent'

type Db = Pick<SupabaseClient, 'from'>

export type ConsentCheck = { ok: true } | { ok: false; error: string }

// ── Before migrations 023 / 035 ──────────────────────────────────────────────
// Until 023 runs, players.adult_confirmed_at / adult_confirmed_by don't exist
// and any query naming them fails (Postgres 42703, PostgREST PGRST204). The
// code then falls back to how the app behaved before the consent rule:
// uploads are not gated, and no player counts as confirmed 18+.
// Until 035 runs, the age band columns don't exist: the code then uses 023's
// rule (18+ confirmation or guardian consent), the same as 023's trigger.
// Once a migration is applied its columns exist and its rule applies.

/** True if `error` is "column does not exist" for one of 023's columns. */
export function isMissingConsentColumn(error: DbErrorLike | null | undefined): boolean {
  return CONSENT_MIGRATION_COLUMNS.some((c) => isMissingColumnError(error, c))
}

/** True if `error` is "column does not exist" for one of 035's columns. */
export function isMissingAgeBandColumn(error: DbErrorLike | null | undefined): boolean {
  return AGE_BAND_MIGRATION_COLUMNS.some((c) => isMissingColumnError(error, c))
}

const warned = new Set<string>()
function warnOnce(context: string, migration: '023' | '035') {
  if (warned.has(migration)) return
  warned.add(migration)
  console.warn(migration === '023'
    ? `[${context}] players.adult_confirmed_at not found: migration 023 not applied yet, so the video consent rule is off`
    : `[${context}] players.age_band not found: migration 035 not applied yet, so 023's 18+/consent rule applies`)
}

type QueryResult = { data: unknown; error: DbErrorLike | null }

function markRows(data: unknown, flags: Record<string, unknown>) {
  const mark = (row: unknown) =>
    row && typeof row === 'object' ? { ...(row as Record<string, unknown>), ...flags } : row
  return Array.isArray(data) ? data.map(mark) : mark(data)
}

/**
 * Runs a players select with `columns` plus the consent columns. If 035's
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
    warnOnce('selectPlayersWithConsent', '035')
    const second = await run(`${columns}, ${PLAYER_CONSENT_COLUMNS_023}`)
    if (!isMissingConsentColumn(second.error)) {
      if (second.error) return second as { data: T | null; error: DbErrorLike | null }
      return { data: markRows(second.data, { age_band: null, age_confirmed_at: null, age_band_pending_migration: true }) as T | null, error: null }
    }
  }
  warnOnce('selectPlayersWithConsent', '023')
  const retry = await run(`${columns}, consent_given_at`)
  if (retry.error) return retry as { data: T | null; error: DbErrorLike | null }
  return {
    data: markRows(retry.data, {
      adult_confirmed_at: null, age_band: null, age_confirmed_at: null,
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
 * Runs a players write with 035's age fields and 023's adult fields. Before
 * 035 it runs again with only the adult fields; before 023 with neither.
 * `bandSaved` says whether the age band was stored.
 */
export async function writeWithAgeFields<R extends QueryResult>(
  ageFields: Record<string, unknown>,
  adultFields: Record<string, unknown>,
  run: (fields: Record<string, unknown>) => PromiseLike<R>,
): Promise<{ result: R; bandSaved: boolean }> {
  const hasAge = Object.keys(ageFields).length > 0
  const first = await run({ ...ageFields, ...adultFields })
  if (hasAge && isMissingAgeBandColumn(first.error)) {
    warnOnce('writeWithAgeFields', '035')
    return { result: await writeWithAdultFields(adultFields, run), bandSaved: false }
  }
  if (isMissingConsentColumn(first.error)) {
    warnOnce('writeWithAgeFields', '023')
    return { result: await run({}), bandSaved: false }
  }
  return { result: first, bandSaved: hasAge && !first.error }
}

/** The fields that record `band` as confirmed by `userId` now (adult_confirmed_* kept in step). */
export function ageBandFields(band: AgeBand | null, userId: string, now = new Date().toISOString()) {
  if (band === null) {
    return {
      age: { age_band: null, age_confirmed_at: null, age_confirmed_by: null },
      adult: { adult_confirmed_at: null, adult_confirmed_by: null },
    }
  }
  return {
    age: { age_band: band, age_confirmed_at: now, age_confirmed_by: userId },
    adult: band === '18_plus'
      ? { adult_confirmed_at: now, adult_confirmed_by: userId }
      : { adult_confirmed_at: null, adult_confirmed_by: null },
  }
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

/**
 * The player's coach records the player's age band (or clears it with null).
 * '18_plus' also sets adult_confirmed_at/by; any other band clears them, so
 * 023's column always agrees with the band. Authorization first.
 */
export async function setAgeBand(
  db: Db,
  userId: string,
  playerId: string,
  band: AgeBand | null,
): Promise<{ success: true } | { error: string }> {
  if (band !== null && !isAgeBand(band)) return { error: 'Choose an age band.' }
  if (!(await canManagePlayerAge(db, userId, playerId))) return { error: 'Not authorized' }

  const what = band === null || band === '18_plus' ? "the player's 18+ status" : "the player's age band"
  const { age, adult } = ageBandFields(band, userId)
  let { error } = await db.from('players').update({ ...age, ...adult }).eq('id', playerId).eq('coach_id', userId)
  if (isMissingAgeBandColumn(error)) {
    // Before 035: only 18+ (or clearing it) can be stored, in 023's columns.
    warnOnce('setAgeBand', '035')
    if (band !== null && band !== '18_plus') return { error: NOT_AVAILABLE_BAND }
    ;({ error } = await db.from('players').update(adult).eq('id', playerId).eq('coach_id', userId))
  }
  if (isMissingConsentColumn(error)) {
    return { error: "Marking players 18+ isn't available yet: a database update still needs to be applied." }
  }
  if (error) {
    console.error('[setAgeBand] update failed', { playerId, code: error.code ?? null, message: error.message })
    return { error: `Couldn't save ${what}. Please try again.` }
  }
  return { success: true }
}

/** Marks (or unmarks) a player as a confirmed adult: the '18_plus' band (or none). */
export async function setAdultConfirmation(
  db: Db,
  userId: string,
  playerId: string,
  confirmed: boolean,
): Promise<{ success: true } | { error: string }> {
  return setAgeBand(db, userId, playerId, confirmed ? '18_plus' : null)
}

/**
 * What an under-13 player's own notice says about their guardian: on file or
 * not, and whether the consent email went out (masked address only).
 */
export async function guardianNoticeFor(
  db: Db,
  player: { guardian_id?: string | null; guardian_invite_sent_at?: string | null } | null | undefined,
): Promise<GuardianNotice> {
  if (!player?.guardian_id) return { onFile: false }
  const emailed = !!player.guardian_invite_sent_at
  if (!emailed) return { onFile: true, emailed: false }
  const { data } = await db.from('guardians').select('email').eq('id', player.guardian_id).maybeSingle()
  const email = (data as { email?: string | null } | null)?.email
  return { onFile: true, emailed: true, maskedEmail: email ? maskEmail(email) : null }
}

/** guardian_invite_sent_at for a player, or null (also before 035). */
export async function guardianInviteSentAt(db: Db, playerId: string): Promise<string | null> {
  const { data, error } = await db.from('players').select('guardian_invite_sent_at').eq('id', playerId).maybeSingle()
  if (error) return null
  return ((data as { guardian_invite_sent_at?: string | null } | null)?.guardian_invite_sent_at) ?? null
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
    const guardian = reason === 'guardian_consent'
      ? await guardianNoticeFor(db, { guardian_id: row.guardian_id, guardian_invite_sent_at: await guardianInviteSentAt(db, playerId) })
      : null
    return uploadBlockedText('player', { reason, selfConfirm: !row.coach_id && !row.guardian_id && (row.age_band ?? null) === null, guardian })
  }
  return uploadBlockedText('coach', { reason })
}

export const SELF_CONFIRM_FAILED = 'We couldn\'t save your confirmation. Please try again.'

/**
 * One-time age band confirmation by the player themself, for a player who
 * signed up without a coach: their own row, no coach, no guardian, no band yet
 * and not confirmed 18+. Players with a coach are refused (their coach records
 * age), and so are players with a guardian on file (a minor whose coach left
 * keeps needing guardian consent). Once a band is on file only a coach can
 * change it. Success only after exactly that row was updated.
 */
export async function confirmOwnAgeBand(db: Db, userId: string, band: AgeBand): Promise<{ success: true } | { error: string }> {
  if (!isAgeBand(band)) return { error: 'Choose your age.' }
  type Row = { id: string; coach_id: string | null; guardian_id: string | null; adult_confirmed_at: string | null; age_band?: string | null }
  let row: Row | null
  let hasBandColumns = true
  {
    const { data, error } = await db
      .from('players')
      .select('id, coach_id, guardian_id, adult_confirmed_at, age_band')
      .eq('user_id', userId)
      .maybeSingle()
    if (isMissingAgeBandColumn(error)) {
      hasBandColumns = false
      if (band !== '18_plus') return { error: "Confirming your age isn't available yet: a database update still needs to be applied." }
      const legacy = await db
        .from('players')
        .select('id, coach_id, guardian_id, adult_confirmed_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (isMissingConsentColumn(legacy.error)) return { error: "Confirming 18+ isn't available yet: a database update still needs to be applied." }
      if (legacy.error) {
        console.error('[confirmOwnAgeBand] read failed', { userId, message: legacy.error.message })
        return { error: SELF_CONFIRM_FAILED }
      }
      row = legacy.data as Row | null
    } else if (isMissingConsentColumn(error)) {
      return { error: "Confirming 18+ isn't available yet: a database update still needs to be applied." }
    } else if (error) {
      console.error('[confirmOwnAgeBand] read failed', { userId, message: error.message })
      return { error: SELF_CONFIRM_FAILED }
    } else {
      row = data as Row | null
    }
  }
  if (!row) return { error: 'Player profile not found.' }
  const current = row.age_band ?? (row.adult_confirmed_at ? '18_plus' : null)
  if (current !== null) {
    return current === band ? { success: true } : { error: 'Your age is already confirmed. Only a coach can change it.' }
  }
  if (row.coach_id) return { error: 'Your coach records your age. Ask them to confirm it.' }
  if (row.guardian_id) return { error: 'A guardian is on file for your account, so video needs their consent.' }

  const { age, adult } = ageBandFields(band, userId)
  let q = db
    .from('players')
    .update(hasBandColumns ? { ...age, ...adult } : adult)
    .eq('id', row.id)
    .eq('user_id', userId)
    .is('coach_id', null)
    .is('guardian_id', null)
    .is('adult_confirmed_at', null)
  if (hasBandColumns) q = q.is('age_band', null)
  const { data: updated, error: updateError } = await q.select('id')
  if (updateError || !Array.isArray(updated) || updated.length !== 1) {
    console.error('[confirmOwnAgeBand] update failed', { userId, playerId: row.id, message: updateError?.message ?? 'no row updated' })
    return { error: SELF_CONFIRM_FAILED }
  }
  return { success: true }
}

/** The 18+ self-confirm (the '18_plus' band). */
export async function confirmOwnAdult(db: Db, userId: string): Promise<{ success: true } | { error: string }> {
  return confirmOwnAgeBand(db, userId, '18_plus')
}
