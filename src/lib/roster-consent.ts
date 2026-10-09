// Roster-only player add + later email attach. Pure constants and parsers
// so the add form, server action, and tests share one wording.

export const MINOR_CONSENT_KINDS = ['coach_is_guardian', 'coach_has_written_permission'] as const
export type MinorConsentKind = (typeof MINOR_CONSENT_KINDS)[number]

export const MINOR_CONSENT_LABELS: Record<MinorConsentKind, string> = {
  coach_is_guardian: "I'm this player's parent/guardian.",
  coach_has_written_permission:
    "I have written permission from this player's parent/guardian to upload video.",
}

export const MINOR_CONSENT_REQUIRED =
  "Choose one permission for this 13–17 player: that you're their parent/guardian, or that you have written permission to upload video."

export const EMAIL_ALREADY_LINKED = 'That email is already linked to another player or account.'
export const EMAIL_SAVED_INVITE_FAILED =
  "Email saved, but the invite didn't send. Copy the link or resend."
export const ROSTER_PLAYER_ADDED = 'Player added to the roster.'
export const ROSTER_NAME_REQUIRED = 'Player name is required.'
export const ATTACH_EMAIL_REQUIRED = 'Enter an email address.'
export const ATTACH_ALREADY_CLAIMED = 'This player already has an account.'
export const ATTACH_NOT_AUTHORIZED = 'Not authorized'

export function isMinorConsentKind(value: unknown): value is MinorConsentKind {
  return typeof value === 'string' && (MINOR_CONSENT_KINDS as readonly string[]).includes(value)
}

export function parseMinorConsentKind(value: unknown): MinorConsentKind | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return isMinorConsentKind(v) ? v : null
}
