// Paid-AI gate for POST /api/ai-chat (RP-041, reliability freeze).
//
// Before this gate the route only checked that someone is signed in, so any
// brand-new account could use the paid AI before the age screen. Now:
//   * a coach (profiles.role = 'coach') passes -- coaches have no age screen;
//     which player's data they may ask about is still checked by
//     loadAiChatContext (own coach, team coach, or the player themself);
//   * anyone else must be past the age screen: their own players row has
//     age_screen_at set and the account is not frozen under 13.
// Otherwise the route answers 403 with a clear JSON error.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isFrozenUnder13, needsAgeConfirm, type PlayerConsentFields } from './consent'
import { selectPlayersWithConsent } from './consent-server'
import { UNDER_13_STOP_MESSAGE } from './under13-mode'

type Db = Pick<SupabaseClient, 'from'>

export const AI_CHAT_AGE_ERROR =
  'Finish the quick age check before using the AI Coach. Open the app and answer the age screen first.'
export const AI_CHAT_NO_PLAYER_ERROR =
  'The AI Coach is available once your player account is set up. Ask your coach for an invite.'

export type AiChatGate = { ok: true } | { ok: false; status: 403; error: string }

export type AiChatGateMessages = { ageError?: string; noPlayerError?: string }

export async function checkAiChatGate(db: Db, userId: string, messages: AiChatGateMessages = {}): Promise<AiChatGate> {
  const ageError = messages.ageError ?? AI_CHAT_AGE_ERROR
  const noPlayerError = messages.noPlayerError ?? AI_CHAT_NO_PLAYER_ERROR
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as { role?: string | null } | null)?.role === 'coach') return { ok: true }

  const { data: player, error } = await selectPlayersWithConsent<PlayerConsentFields>(
    'age_band, age_band_coach, age_band_self, age_screen_at, age_confirmed_at',
    (cols) => db.from('players').select(cols).eq('user_id', userId).maybeSingle(),
  )
  if (error || !player) return { ok: false, status: 403, error: noPlayerError }
  if (isFrozenUnder13(player)) return { ok: false, status: 403, error: UNDER_13_STOP_MESSAGE }
  if (needsAgeConfirm(player)) return { ok: false, status: 403, error: ageError }
  return { ok: true }
}
