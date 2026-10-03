'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AGE_STOP_COOKIE, bandFromBirth } from '@/lib/age-band'
import { recordOwnAgeAnswer } from '@/lib/consent-server'
import { parentConsentFlowEnabled } from '@/lib/under13-mode'
import { setAgeStopCookie } from '@/lib/age-stop-cookie'

export type AgeAnswerState = { error?: string; stopped?: boolean; done?: boolean } | undefined

/**
 * The signed-in player's birth month/year answer: the first-sign-in age
 * screen for a coach-invited player, or the one-time confirm for a player
 * with no coach. The month and year become a band here and are not stored.
 *
 * Under 13 (hard stop, src/lib/under13-mode.ts): the player is shown the stop
 * message, a session cookie blocks another answer, and they are signed out.
 * Only the band 'under_13' is stored on their existing players row, so video
 * stays blocked on any device (nothing else about the child is kept).
 * With the stop cookie set, every answer is refused the same way.
 */
export async function submitAgeAnswer(_prev: AgeAnswerState, formData: FormData): Promise<AgeAnswerState> {
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Sign in again.' }

  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }

  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    const saved = await recordOwnAgeAnswer(supabaseAdmin, user.id, 'under_13')
    if ('error' in saved) console.error('[submitAgeAnswer] under-13 answer not stored', { userId: user.id, error: saved.error })
    setAgeStopCookie(jar)
    await supabase.auth.signOut({ scope: 'local' })
    revalidatePath('/dashboard', 'layout')
    return { stopped: true }
  }

  const saved = await recordOwnAgeAnswer(supabaseAdmin, user.id, parsed.band)
  if ('error' in saved) return { error: saved.error }
  revalidatePath('/dashboard', 'layout')
  return { done: true }
}
