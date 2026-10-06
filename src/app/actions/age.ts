'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AGE_STOP_COOKIE, bandFromBirth } from '@/lib/age-band'
import { createOwnPlayerRow, PLAYER_NOT_FOUND, recordOwnAgeAnswer, SELF_CONFIRM_FAILED } from '@/lib/consent-server'
import { parentConsentFlowEnabled } from '@/lib/under13-mode'
import { setAgeStopCookie } from '@/lib/age-stop-cookie'
import { recordTermsAcceptance } from '@/lib/terms-acceptance'
import { freezeUnder13Account } from '@/lib/under13-freeze'
import { TERMS_VERSION } from '@/lib/terms-version'
import { TOS_REQUIRED, NAME_REQUIRED, toTitleCase } from '@/lib/signup-fields'

export type AgeConfirmState = { error?: string; stopped?: boolean; done?: boolean } | undefined

/**
 * The one screen for a signed-in player account whose age isn't confirmed
 * yet: a coach-invited player accepting the invite, or a Google/Apple
 * sign-up at first sign-in. Birth month and year (turned into a band here,
 * never stored), name and the Terms, in one step, once.
 *
 * Order matters:
 *   1. The 24-hour stop cookie refuses every answer, whatever the form says
 *      (a back-button resubmit included).
 *   2. The age is checked before anything is read or saved. Under 13 (hard
 *      stop): the cookie is set, the account is frozen (band 'under_13' on
 *      the player's row so the block holds on every device), its profile is
 *      blanked (name, photo, provider data; src/lib/under13-freeze.ts) and
 *      marked for deletion, and it's signed out. No name is saved.
 *   3. 13 or older: the Terms acceptance (history + profile, once), the
 *      name, then the band (the younger of the player's and the coach's
 *      answers wins). One answer only: a second one is refused.
 */
export async function confirmAgeAndTerms(_prev: AgeConfirmState, formData: FormData): Promise<AgeConfirmState> {
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }

  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }

  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    setAgeStopCookie(jar)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Freeze, blank the profile (name, photo, provider data), mark for deletion.
      await freezeUnder13Account(supabaseAdmin, user.id)
      await supabase.auth.signOut({ scope: 'local' })
    }
    revalidatePath('/', 'layout')
    return { stopped: true }
  }

  if (formData.get('tos') !== 'yes') return { error: TOS_REQUIRED }
  const fullName = toTitleCase(String(formData.get('full_name') ?? ''))
  if (!fullName) return { error: NAME_REQUIRED }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Sign in again.' }

  if (!(await recordTermsAcceptance(supabaseAdmin, user.id, new Date().toISOString(), TERMS_VERSION))) {
    return { error: SELF_CONFIRM_FAILED }
  }

  // The name first (harmless on its own), then the band, so a retry after
  // any failure starts over cleanly and a second answer is refused.
  const [{ error: playerNameError }, { error: profileNameError }] = await Promise.all([
    supabaseAdmin.from('players').update({ full_name: fullName }).eq('user_id', user.id),
    supabaseAdmin.from('profiles').update({ full_name: fullName }).eq('id', user.id),
  ])
  if (playerNameError || profileNameError) {
    console.error('[confirmAgeAndTerms] name not saved', { userId: user.id, player: playerNameError?.code ?? null, profile: profileNameError?.code ?? null })
    return { error: SELF_CONFIRM_FAILED }
  }

  let saved = await recordOwnAgeAnswer(supabaseAdmin, user.id, parsed.band)
  if ('error' in saved && saved.error === PLAYER_NOT_FOUND) {
    saved = await createOwnPlayerRow(supabaseAdmin, user, parsed.band, fullName)
  }
  if ('error' in saved) return { error: saved.error }

  revalidatePath('/', 'layout')
  return { done: true }
}
