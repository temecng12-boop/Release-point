// Audience labels for the clip AI Coach tab (promo v8 parity).
// Labels only — they do not change model, prompts, or tools. Coach and player
// share the same chat backend; Lite must not claim a weaker model.

export type AiCoachAudience = 'coach' | 'player'

/** Badge text shown above the AI chat for this viewer. */
export function aiCoachAudienceBadge(role: AiCoachAudience): string {
  return role === 'coach' ? 'AI Coach · Full' : 'Player AI · Lite'
}

/** Short eyebrow under the badge (promo still 08 card). */
export function aiCoachAudienceEyebrow(role: AiCoachAudience): string {
  return role === 'coach' ? 'Deep read of notes + metrics' : 'Your bot'
}
