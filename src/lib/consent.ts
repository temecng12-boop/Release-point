// Video consent rule for players (RP-041, age bands from migration 035).
//
// Stored on the players row:
//   * players.age_band          'under_13' | '13_17' | '18_plus', or NULL (unknown)
//   * players.age_confirmed_at  when the band was confirmed (set with age_band)
//   * players.adult_confirmed_at set for 18+ (023; kept in step with '18_plus')
//   * players.consent_given_at  set when a guardian has given consent
//
// Video can be added for a player when ANY of these holds, checked in this order
// (the same rule as public.player_has_video_consent in migration 035):
//   1. consent_given_at is set (guardian consent covers every band);
//   2. age_band is '13_17' or '18_plus' and age_confirmed_at is set;
//   3. age_band is NULL and adult_confirmed_at is set (18+ confirmed before 035).
// Everything else is blocked:
//   * 'under_13' without guardian consent (adult_confirmed_at is ignored then);
//   * unknown band (NULL) with no 18+ confirmation and no consent: blocked until
//     the player's coach picks a band, or a player with no coach confirms
//     their own band once.
// There is no age inference from age_group; the stored status is the only
// source of truth.
//
// This file is pure so it can be used from client components, server code and
// tests. Server-side enforcement lives in ./consent-server.ts.

export const AGE_BANDS = ['under_13', '13_17', '18_plus'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under_13: 'Under 13',
  '13_17': '13 to 17',
  '18_plus': '18 or older',
}

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === 'string' && (AGE_BANDS as readonly string[]).includes(value)
}

export type PlayerConsentFields = {
  adult_confirmed_at?: string | null
  consent_given_at?: string | null
  age_band?: string | null
  age_confirmed_at?: string | null
  /**
   * Set by the server when the database doesn't have migration 023's columns
   * yet (see consent-server.ts). The consent rule then isn't enforced, so
   * uploads work as they did before this feature; the player counts as not
   * confirmed 18+.
   */
  consent_rules_pending_migration?: boolean
  /**
   * Set by the server when 023 is applied but migration 035's age band
   * columns don't exist yet. The 023 rule applies then (18+ confirmation or
   * guardian consent), exactly like 023's trigger.
   */
  age_band_pending_migration?: boolean
}

export type UploadConsentStatus = 'adult_confirmed' | 'age_confirmed' | 'guardian_consent' | 'pending' | 'rules_not_active'

/** Why a player is blocked: their age band is unknown, or they are under 13 without guardian consent. */
export type PendingReason = 'age_band' | 'guardian_consent'

/** Columns to select from `players` when checking upload consent (035 applied). */
export const PLAYER_CONSENT_COLUMNS = 'adult_confirmed_at, consent_given_at, age_band, age_confirmed_at'
/** The same before migration 035 (023's columns only). */
export const PLAYER_CONSENT_COLUMNS_023 = 'adult_confirmed_at, consent_given_at'

/** Columns added by migration 023. Before 023 runs, queries naming them fail. */
export const CONSENT_MIGRATION_COLUMNS = ['adult_confirmed_at', 'adult_confirmed_by'] as const
/** Columns added by migration 035. Before 035 runs, queries naming them fail. */
export const AGE_BAND_MIGRATION_COLUMNS = ['age_band', 'age_confirmed_at', 'age_confirmed_by', 'guardian_invite_sent_at', 'tos_accepted_at'] as const

function isSet(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

export function uploadConsentStatus(player: PlayerConsentFields | null | undefined): UploadConsentStatus {
  if (!player) return 'pending'
  if (player.consent_rules_pending_migration === true) return 'rules_not_active'
  if (isSet(player.consent_given_at)) return 'guardian_consent'
  if (player.age_band_pending_migration === true) {
    // 023's rule, as its trigger enforces it before 035.
    return isSet(player.adult_confirmed_at) ? 'adult_confirmed' : 'pending'
  }
  const band = player.age_band ?? null
  if (band === '13_17' || band === '18_plus') {
    if (!isSet(player.age_confirmed_at)) return 'pending'
    return band === '18_plus' ? 'adult_confirmed' : 'age_confirmed'
  }
  if (band === null && isSet(player.adult_confirmed_at)) return 'adult_confirmed'
  return 'pending'
}

/** True if video may be uploaded or recorded for this player. */
export function canUploadVideo(player: PlayerConsentFields | null | undefined): boolean {
  return uploadConsentStatus(player) !== 'pending'
}

/** The player's confirmed band, or null (unknown, or 035 not applied). */
export function confirmedAgeBand(player: PlayerConsentFields | null | undefined): AgeBand | null {
  if (!player || player.age_band_pending_migration || player.consent_rules_pending_migration) return null
  return isAgeBand(player.age_band) && isSet(player.age_confirmed_at) ? player.age_band : null
}

/** True if the player is confirmed under 13 (the only band that needs a guardian). */
export function isUnder13(player: PlayerConsentFields | null | undefined): boolean {
  return confirmedAgeBand(player) === 'under_13'
}

/** Why uploads are blocked, or null if they aren't. */
export function pendingReason(player: PlayerConsentFields | null | undefined): PendingReason | null {
  if (canUploadVideo(player)) return null
  return isUnder13(player) ? 'guardian_consent' : 'age_band'
}

export const UPLOAD_BLOCKED_MESSAGE =
  "Video can't be added for this player yet: their age isn't confirmed, or guardian consent is still pending."

/** The clips trigger's error (023: "guardian consent ... pending", 035: "video consent ... pending"), code 42501. */
export function isConsentPendingError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && error.code === '42501' && /consent .*pending/i.test(error.message ?? '')
}

export type UploadBlockedViewer = 'coach' | 'player'

export type GuardianNotice = {
  /** A guardian is on file for the player. */
  onFile: boolean
  /** Masked guardian email (j***@g***.com), only when a consent email was sent. */
  maskedEmail?: string | null
  /** A consent email was sent (players.guardian_invite_sent_at is set). */
  emailed?: boolean
}

export const UNDER_13_PLAYER_MESSAGE = 'Ask your parent or guardian to give consent.'
export const NO_GUARDIAN_NEXT_STEP = "Ask your coach to add your parent's email."

/** Next step for an under-13 player, depending on whether a guardian is on file and was emailed. */
export function guardianNextStep(guardian: GuardianNotice | null | undefined): string {
  if (!guardian?.onFile) return NO_GUARDIAN_NEXT_STEP
  if (guardian.emailed) return guardian.maskedEmail ? `We emailed them at ${guardian.maskedEmail}.` : 'We emailed them.'
  return 'Your coach has their email on file. Ask your coach to send the consent email.'
}

/**
 * Plain explanation shown wherever upload or record is blocked.
 * `reason`: from pendingReason (defaults to 'age_band').
 * `selfConfirm`: the player has no coach, so they confirm their age band
 * themself (see canSelfConfirmAgeBand); `confirmShownBelow` when the picker is
 * shown under it. `guardian`: for an under-13 player's own copy.
 */
export function uploadBlockedCopy(
  viewer: UploadBlockedViewer,
  opts: { reason?: PendingReason; selfConfirm?: boolean; confirmShownBelow?: boolean; guardian?: GuardianNotice | null } = {},
): { message: string; nextStep: string } {
  const reason = opts.reason ?? 'age_band'
  if (viewer === 'player') {
    if (reason === 'guardian_consent') {
      return { message: UNDER_13_PLAYER_MESSAGE, nextStep: `Video can't be added until they do. ${guardianNextStep(opts.guardian)}` }
    }
    return {
      message: "Your age isn't confirmed yet, so video can't be added yet.",
      nextStep: opts.selfConfirm
        ? `Confirm your age ${opts.confirmShownBelow ? 'below' : 'at the top of your dashboard'}.`
        : 'Ask your coach to confirm your age.',
    }
  }
  if (reason === 'guardian_consent') {
    return {
      message: "Guardian consent for this player is still pending, so video can't be added yet.",
      nextStep: 'Players under 13 need consent from a parent or guardian. Add or resend the guardian email in Edit Player.',
    }
  }
  return {
    message: "This player's age isn't confirmed yet, so video can't be added yet.",
    nextStep: 'Confirm their age (under 13, 13 to 17, or 18 or older) in Edit Player or on their profile.',
  }
}

/** The blocked copy as one sentence pair, for an upload action's error. */
export function uploadBlockedText(
  viewer: UploadBlockedViewer,
  opts: { reason?: PendingReason; selfConfirm?: boolean; guardian?: GuardianNotice | null } = {},
): string {
  const { message, nextStep } = uploadBlockedCopy(viewer, opts)
  return `${message} ${nextStep}`
}

/**
 * A player who signed up without a coach confirms their own age band, once:
 * no coach, no guardian on file, no band yet, and still blocked. Once a band
 * is on file only a coach can change it, so a coachless under-13 player can't
 * switch to an older band. guardian_id is read, so it must be selected.
 */
export function canSelfConfirmAgeBand(
  player: (PlayerConsentFields & { coach_id?: string | null; guardian_id?: string | null }) | null | undefined,
): boolean {
  // A guardian on file means a minor: they need guardian consent, never a self-confirm.
  return !!player && !player.coach_id && !player.guardian_id && (player.age_band ?? null) === null
    && uploadConsentStatus(player) === 'pending'
}

/** Before 035 the self-confirm is the 18+ confirmation; same rule. */
export const canSelfConfirmAdult = canSelfConfirmAgeBand

/** Coach-side view: a player needs an action (age band or under-13 consent). */
export function needsCoachAction(player: PlayerConsentFields | null | undefined): boolean {
  return pendingReason(player) !== null
}
