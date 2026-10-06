// Where the dashboard and the one-screen page (/onboarding/age) send a
// signed-in account. Pure, so the two can be checked together: a page only
// redirects on a CONFIRMED state (rows read without error); a failed or
// missing read shows a friendly error with Try again and Sign out instead,
// so the two pages can never send each other back and forth.
import { needsAgeConfirm, type PlayerConsentFields } from './consent'

export type Read<T> = { data: T | null; error: unknown }
type Profile = { role?: string | null }

export type DashboardRoute = 'error' | 'guardian' | 'age' | 'continue'
/**
 * Dashboard: 'age' only for a confirmed player account (profile read fine,
 * role 'player') whose player row read fine and hasn't answered yet.
 * A failed profile read, or no profile row, is 'error'. A failed player row
 * read never redirects (the page shows what it can).
 */
export function dashboardRoute(profile: Read<Profile>, player: Read<PlayerConsentFields> | null): DashboardRoute {
  if (profile.error || !profile.data) return 'error'
  if (profile.data.role === 'guardian') return 'guardian'
  if (profile.data.role !== 'player') return 'continue'
  if (!player || player.error) return 'continue'
  return needsAgeConfirm(player.data) ? 'age' : 'continue'
}

export type AgePageRoute = 'stop' | 'error' | 'dashboard' | 'form'
/**
 * /onboarding/age: the stop cookie first; then 'dashboard' only for a
 * confirmed non-player account or a player who has already answered.
 * A failed or missing read is 'error' (never a redirect back to the dashboard).
 */
export function agePageRoute(stopCookie: boolean, profile: Read<Profile>, player: Read<PlayerConsentFields> | null): AgePageRoute {
  if (stopCookie) return 'stop'
  if (profile.error || !profile.data) return 'error'
  if (profile.data.role !== 'player') return 'dashboard'
  if (!player || player.error) return 'error'
  return needsAgeConfirm(player.data) ? 'form' : 'dashboard'
}
