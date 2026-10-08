// The one-screen age gate for the middleware (reliability freeze).
//
// Every new auth user funnels through the birth month/year screen
// (/onboarding/age) before using the app: invited players (via /onboarding),
// OAuth signups, OTP self-signups, and the legacy coach signUp (via
// /dashboard, which redirects unanswered players). Coaches and guardians
// have no age screen. This gate closes the direct-navigation hole: a signed-in
// player account that hasn't answered yet (no age_screen_at, including no
// players row at all) gets the age screen on every page, 403 on API routes,
// and 403 on server actions -- except the setup paths it needs to finish
// (the age screen itself, onboarding, and all auth routes: invite accept,
// password reset, sign-out).
import { needsAgeConfirm, type PlayerConsentFields } from './consent'

export const AGE_SCREEN_PATH = '/onboarding/age'

export const AGE_SCREEN_MESSAGE =
  'Please finish setting up your account first — answer the quick age check.'

// Setup paths a pre-screen account may still use.
export function isAgeGateSetupPath(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/') || pathname.startsWith('/auth')
}

export type AgeScreenDb = {
  from(table: string): {
    select(cols: string): {
      eq(c: string, v: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>
      }
    }
  }
}

/**
 * True if this account must see the age screen before using the app: a
 * player-role account whose age isn't confirmed yet. Coaches, guardians, and
 * accounts with no profile row pass. A failed players read fails open (the
 * dashboard shows its error state instead); a missing players row is gated
 * (a brand-new account that hasn't answered).
 */
export async function needsAgeScreen(db: AgeScreenDb, userId: string): Promise<boolean> {
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as { role?: string | null } | null)?.role !== 'player') return false
  const { data: player, error } = await db
    .from('players')
    .select('age_band, age_band_coach, age_band_self, age_screen_at, age_confirmed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[age-screen-gate] player read failed; not blocking', { message: error.message ?? null })
    return false
  }
  return needsAgeConfirm(player as PlayerConsentFields | null)
}
