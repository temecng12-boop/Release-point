// The one switch for players under 13 (compliance/under13-consent-spec.md).
//
// 'hard_stop' (PR A, now): there is no parent-consent flow yet.
//   * Self-signup with an under-13 answer stores nothing about the child
//     (no Supabase call), shows UNDER_13_STOP_MESSAGE and sets a 24-hour
//     cookie that blocks another answer. An existing account (invited or
//     Google/Apple) that answers under 13 is frozen: only age_band_self is
//     kept, and every player page shows the stop message.
//   * A coach can't invite onto a team with an under-13 age group; a player
//     a coach marks under 13 (Edit Player) can't have video added, and the
//     coach sees PARENT_CONSENT_COMING_SOON.
//   * recordConsent never grants consent; the guardian add / email / resend
//     UI and paths are not in this build (parked on the branch
//     guardian-consent-parked-2026-10 for PR B).
// 'parent_consent' (PR B): the admin-approved parent consent flow. Not built
// yet: the database (migration 037) still blocks video for under_13, so
// turning this on alone changes no access.
export type Under13Mode = 'hard_stop' | 'parent_consent'

export const UNDER_13_MODE: Under13Mode = 'hard_stop'

export function parentConsentFlowEnabled(mode: Under13Mode = UNDER_13_MODE): boolean {
  return mode === 'parent_consent'
}

import { AGE_STOP_MESSAGE } from './stop-message'

export const UNDER_13_STOP_MESSAGE = AGE_STOP_MESSAGE
export const PARENT_CONSENT_COMING_SOON = 'Parent consent for players under 13 is coming soon.'
export const PARENT_CONSENT_UNAVAILABLE = "Parent permission can't be given in the app yet. It's coming soon."
export const UNDER_13_INVITE_REFUSED = `Players under 13 can't be added yet. ${PARENT_CONSENT_COMING_SOON}`
export const UNDER_13_TEAM_REFUSED = `This team's age group is for players under 13, who can't be added yet. ${PARENT_CONSENT_COMING_SOON}`
