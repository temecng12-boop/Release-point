// Video rule for players (RP-041; age bands from migration 037).
//
// With 037: video may be added for a player only when their effective band
// (players.age_band) is '13_17' or '18_plus' and age_confirmed_at is set.
//   * Unknown band (NULL): blocked until a coach picks a band, the player
//     answers the age screen, or a player with no coach confirms once.
//   * 'under_13': blocked. Under 13 is a hard stop for now (see
//     ./under13-mode.ts); PR B adds admin-approved parent consent.
//   * consent_given_at no longer allows video on its own: the old one-click
//     consent never verified a parent.
// Same rule as public.player_has_video_consent in migration 037.
//
// Fallbacks, as the server reads them (./consent-server.ts):
//   * 037 not applied (age_band_pending_migration): 023's rule, exactly as
//     023's trigger enforces it: adult_confirmed_at or consent_given_at.
//   * 023 not applied (consent_rules_pending_migration): no rule (uploads work
//     as before this feature).
//
// Pure, so it can be used from client components, server code and tests.

import { AGE_BANDS, AGE_BAND_LABELS, isAgeBand, type AgeBand } from './age-band'
import { PARENT_CONSENT_COMING_SOON, UNDER_13_STOP_MESSAGE } from './under13-mode'

export { AGE_BANDS, AGE_BAND_LABELS, isAgeBand, type AgeBand }

export type PlayerConsentFields = {
  adult_confirmed_at?: string | null
  consent_given_at?: string | null
  age_band?: string | null
  age_confirmed_at?: string | null
  age_band_coach?: string | null
  age_band_self?: string | null
  age_screen_at?: string | null
  /** Set by the server when migration 023's columns don't exist yet. */
  consent_rules_pending_migration?: boolean
  /** Set by the server when 023 is applied but 037's age columns aren't. */
  age_band_pending_migration?: boolean
}

export type UploadConsentStatus = 'adult_confirmed' | 'age_confirmed' | 'guardian_consent' | 'pending' | 'rules_not_active'

/** Why a player is blocked: their band is unknown, or they are under 13. */
export type PendingReason = 'age_band' | 'under_13'

/** Columns to select from `players` when checking the video rule (037 applied). */
export const PLAYER_CONSENT_COLUMNS = 'adult_confirmed_at, consent_given_at, age_band, age_confirmed_at, age_band_coach, age_band_self, age_screen_at'
/** The same before migration 037 (023's columns only). */
export const PLAYER_CONSENT_COLUMNS_023 = 'adult_confirmed_at, consent_given_at'

/** Columns added by migration 023. Before 023 runs, queries naming them fail. */
export const CONSENT_MIGRATION_COLUMNS = ['adult_confirmed_at', 'adult_confirmed_by'] as const
/** Columns added by migration 037. Before 037 runs, queries naming them fail. */
export const AGE_BAND_MIGRATION_COLUMNS = [
  'age_band', 'age_band_coach', 'age_band_self', 'age_band_source', 'age_screen_at',
  'age_confirmed_at', 'age_confirmed_by', 'tos_accepted_at',
] as const

function isSet(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

export function uploadConsentStatus(player: PlayerConsentFields | null | undefined): UploadConsentStatus {
  if (!player) return 'pending'
  if (player.consent_rules_pending_migration === true) return 'rules_not_active'
  if (player.age_band_pending_migration === true) {
    // 023's rule, as its trigger enforces it before 037.
    if (isSet(player.adult_confirmed_at)) return 'adult_confirmed'
    return isSet(player.consent_given_at) ? 'guardian_consent' : 'pending'
  }
  if (!isSet(player.age_confirmed_at)) return 'pending'
  if (player.age_band === '18_plus') return 'adult_confirmed'
  if (player.age_band === '13_17') return 'age_confirmed'
  return 'pending'
}

/** True if video may be uploaded or recorded for this player. */
export function canUploadVideo(player: PlayerConsentFields | null | undefined): boolean {
  return uploadConsentStatus(player) !== 'pending'
}

/** The player's confirmed effective band, or null (unknown, or 037 not applied). */
export function confirmedAgeBand(player: PlayerConsentFields | null | undefined): AgeBand | null {
  if (!player || player.age_band_pending_migration || player.consent_rules_pending_migration) return null
  return isAgeBand(player.age_band) && isSet(player.age_confirmed_at) ? player.age_band : null
}

/** True if the player's effective band is under 13. */
export function isUnder13(player: PlayerConsentFields | null | undefined): boolean {
  return confirmedAgeBand(player) === 'under_13'
}

/** Why uploads are blocked, or null if they aren't. */
export function pendingReason(player: PlayerConsentFields | null | undefined): PendingReason | null {
  if (canUploadVideo(player)) return null
  return isUnder13(player) ? 'under_13' : 'age_band'
}

export const UPLOAD_BLOCKED_MESSAGE =
  "Video can't be added for this player yet: their age isn't confirmed, or they're under 13."

/** The clips trigger's error (023: "guardian consent ... pending", 037: "video consent ... pending"), code 42501. */
export function isConsentPendingError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && error.code === '42501' && /consent .*pending/i.test(error.message ?? '')
}

export type UploadBlockedViewer = 'coach' | 'player'

/**
 * Plain explanation shown wherever upload or record is blocked.
 * `reason`: from pendingReason (defaults to 'age_band'). `selfConfirm`: the
 * player has no coach, so they confirm their age themself (see
 * canSelfConfirmAgeBand); `confirmShownBelow` when the form is shown under it.
 */
export function uploadBlockedCopy(
  viewer: UploadBlockedViewer,
  opts: { reason?: PendingReason; selfConfirm?: boolean; confirmShownBelow?: boolean } = {},
): { message: string; nextStep: string } {
  const reason = opts.reason ?? 'age_band'
  if (viewer === 'player') {
    if (reason === 'under_13') {
      return { message: UNDER_13_STOP_MESSAGE, nextStep: "Video can't be added until then." }
    }
    return {
      message: "Your age isn't confirmed yet, so video can't be added yet.",
      nextStep: opts.selfConfirm
        ? `Confirm your age ${opts.confirmShownBelow ? 'below' : 'at the top of your dashboard'}.`
        : 'Ask your coach to confirm your age.',
    }
  }
  if (reason === 'under_13') {
    return {
      message: "This player is under 13, so video can't be added.",
      nextStep: `${PARENT_CONSENT_COMING_SOON} If their age is wrong, change it in Edit Player.`,
    }
  }
  return {
    message: "This player's age isn't confirmed yet, so video can't be added yet.",
    nextStep: 'Pick their age (under 13, 13 to 17, or 18 or older) in Edit Player or on their profile.',
  }
}

/** The blocked copy as one sentence pair, for an upload action's error. */
export function uploadBlockedText(
  viewer: UploadBlockedViewer,
  opts: { reason?: PendingReason; selfConfirm?: boolean } = {},
): string {
  const { message, nextStep } = uploadBlockedCopy(viewer, opts)
  return `${message} ${nextStep}`
}

type RosterFields = PlayerConsentFields & { coach_id?: string | null; guardian_id?: string | null; user_id?: string | null }

/**
 * A player who signed up without a coach confirms their own age, once: no
 * coach, no guardian on file, no answer yet, 037 applied. Once a band is on
 * file only a coach can change it, so a coachless under-13 answer can't be
 * switched to an older band. guardian_id is read, so it must be selected.
 */
export function canSelfConfirmAgeBand(player: RosterFields | null | undefined): boolean {
  return !!player && !player.coach_id && !player.guardian_id
    && !player.age_band_pending_migration && !player.consent_rules_pending_migration
    && (player.age_band ?? null) === null && (player.age_band_self ?? null) === null
    && !isSet(player.age_screen_at)
}

/** Before 037 the self-confirm is 023's 18+ confirmation. */
export function canSelfConfirmAdult023(player: RosterFields | null | undefined): boolean {
  return !!player && !player.coach_id && !player.guardian_id && player.age_band_pending_migration === true
    && uploadConsentStatus(player) === 'pending'
}

/**
 * A coach-invited player answers the birth month/year screen at their first
 * sign-in, before anything else (spec T1). Not for an under-13 player (they
 * see the stop message instead) or before 037.
 */
export function needsAgeScreen(player: RosterFields | null | undefined): boolean {
  return !!player && !!player.coach_id
    && !player.age_band_pending_migration && !player.consent_rules_pending_migration
    && !isSet(player.age_screen_at) && !isUnder13(player)
}

/**
 * A new player account with no coach and no age on file (for example a
 * Google or Apple sign-up, which skips the signup age screen) answers the
 * age screen before onboarding. Existing coachless players who already
 * onboarded answer from the dashboard banner instead.
 */
export function needsFirstAgeScreen(player: (RosterFields & { position?: string | null }) | null | undefined): boolean {
  return needsAgeScreen(player) || (!!player && !player.position && canSelfConfirmAgeBand(player))
}

/** Coach-side view: a player needs an action (age band) or is under 13. */
export function needsCoachAction(player: PlayerConsentFields | null | undefined): boolean {
  return pendingReason(player) !== null
}
