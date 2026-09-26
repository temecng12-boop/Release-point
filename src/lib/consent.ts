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
}

export type UploadConsentStatus = 'adult_confirmed' | 'guardian_consent' | 'pending'

/** Columns to select from `players` when checking upload consent. */
export const PLAYER_CONSENT_COLUMNS = 'adult_confirmed_at, consent_given_at'

function isSet(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

export function uploadConsentStatus(player: PlayerConsentFields | null | undefined): UploadConsentStatus {
  if (!player) return 'pending'
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

export type UploadBlockedViewer = 'coach' | 'player'

/** Plain explanation shown wherever upload or record is blocked. */
export function uploadBlockedCopy(viewer: UploadBlockedViewer): { message: string; nextStep: string } {
  if (viewer === 'player') {
    return {
      message: "Guardian consent for your account is still pending, so video can't be added yet.",
      nextStep: 'If you are 18 or older, ask your coach to mark you as 18+.',
    }
  }
  return {
    message: UPLOAD_BLOCKED_MESSAGE,
    nextStep: 'If the player is 18 or older, mark them as 18+ on their profile or in Edit Player.',
  }
}
