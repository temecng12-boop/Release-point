// Video consent rule for players (RP-041).
//
// Consent status is captured once, when a player signs up or a coach adds
// them, and stored on the players row:
//   * players.adult_confirmed_at  set when the player is confirmed 18+
//                                 (self-signup checkbox, or the coach)
//   * players.consent_given_at    set when a guardian has given consent
//
// Video can be added for a player only if one of those is set. Anything else
// (a minor waiting on consent, or no age status at all) is blocked. There is no
// age inference from age_group; the stored status is the only source of truth.
//
// This file is pure so it can be used from client components, server code and
// tests. Server-side enforcement lives in ./consent-server.ts.

export type PlayerConsentFields = {
  adult_confirmed_at?: string | null
  consent_given_at?: string | null
  /**
   * Set by the server when the database doesn't have migration 023's columns
   * yet (see consent-server.ts). The consent rule then isn't enforced, so
   * uploads work as they did before this feature; the player counts as not
   * confirmed 18+.
   */
  consent_rules_pending_migration?: boolean
}

export type UploadConsentStatus = 'adult_confirmed' | 'guardian_consent' | 'pending' | 'rules_not_active'

/** Columns to select from `players` when checking upload consent. */
export const PLAYER_CONSENT_COLUMNS = 'adult_confirmed_at, consent_given_at'

/** Columns added by migration 023. Before 023 runs, queries naming them fail. */
export const CONSENT_MIGRATION_COLUMNS = ['adult_confirmed_at', 'adult_confirmed_by'] as const

function isSet(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

export function uploadConsentStatus(player: PlayerConsentFields | null | undefined): UploadConsentStatus {
  if (!player) return 'pending'
  if (player.consent_rules_pending_migration === true) return 'rules_not_active'
  if (isSet(player.adult_confirmed_at)) return 'adult_confirmed'
  if (isSet(player.consent_given_at)) return 'guardian_consent'
  return 'pending'
}

/** True if video may be uploaded or recorded for this player. */
export function canUploadVideo(player: PlayerConsentFields | null | undefined): boolean {
  return uploadConsentStatus(player) !== 'pending'
}

export const UPLOAD_BLOCKED_MESSAGE =
  "Guardian consent for this player is still pending, so video can't be added yet."

/** Migration 023's clips trigger: "guardian consent for this player is still pending" (42501). */
export function isConsentPendingError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && error.code === '42501' && /consent .*pending/i.test(error.message ?? '')
}

export type UploadBlockedViewer = 'coach' | 'player'

/**
 * Plain explanation shown wherever upload or record is blocked.
 * `selfConfirm`: the player has no coach, so they confirm 18+ themself
 * (see canSelfConfirmAdult); `below` when the confirm button is shown under it.
 */
export function uploadBlockedCopy(
  viewer: UploadBlockedViewer,
  opts: { selfConfirm?: boolean; confirmShownBelow?: boolean } = {},
): { message: string; nextStep: string } {
  if (viewer === 'player') {
    const adult = opts.selfConfirm
      ? `If you are 18 or older, confirm it ${opts.confirmShownBelow ? 'below' : 'on your dashboard'}.`
      : 'If you are 18 or older, ask your coach to mark you as 18+.'
    return {
      message: "Guardian consent for your account is still pending, so video can't be added yet.",
      nextStep: `${adult} If you are under 18, a parent or guardian has to give consent first.`,
    }
  }
  return {
    message: UPLOAD_BLOCKED_MESSAGE,
    nextStep: 'If the player is 18 or older, mark them as 18+ on their profile or in Edit Player.',
  }
}

/** The blocked copy as one sentence pair, for an upload action's error. */
export function uploadBlockedText(viewer: UploadBlockedViewer, opts: { selfConfirm?: boolean } = {}): string {
  const { message, nextStep } = uploadBlockedCopy(viewer, { selfConfirm: opts.selfConfirm })
  return `${message} ${nextStep}`
}

/**
 * A player who signed up without a coach can confirm they are 18+ themself,
 * once: no coach can do it for them (only the player's own coach may mark a
 * player 18+). Players with a coach keep the coach's age choice; players with
 * a guardian on file are refused (guardian_id is read, so it must be selected).
 */
export function canSelfConfirmAdult(
  player: (PlayerConsentFields & { coach_id?: string | null; guardian_id?: string | null }) | null | undefined,
): boolean {
  // A guardian on file means a minor: they need guardian consent, never a self-confirm.
  return !!player && !player.coach_id && !player.guardian_id && uploadConsentStatus(player) === 'pending'
}
