// Server only. What happens to a signed-in account when its player answers
// under 13 (hard stop, src/lib/under13-mode.ts), e.g. on /onboarding/age
// after signing in with Google or Apple from the sign-in page:
//   1. the freeze: band 'under_13' on the player's row (the middleware and
//      the database then block the account on every device);
//   2. the profile is blanked: name, photo and every other profile field the
//      person or the provider filled in; any photo file is deleted. Only the
//      id, the role and the freeze marks stay (frozen_at,
//      deletion_requested_at; migration 040). A coachless player row loses
//      its name and email too (a coach-invited row keeps what the coach
//      entered: that's the coach's roster);
//   3. the provider's name and picture are removed from the auth user's
//      metadata (the email stays: the auth user needs it to sign in).
// The auth user isn't deleted now, so the freeze holds across devices and
// the stop message shows wherever they sign in; the deletion job (PR B)
// removes accounts marked for deletion after 14 days without consent.
// Nothing here logs a name or an email.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError, type DbErrorLike } from './db-errors'
import { createOwnPlayerRow, PLAYER_NOT_FOUND, recordOwnAgeAnswer } from './consent-server'

type Db = Pick<SupabaseClient, 'from' | 'storage'> & {
  auth: { admin: { updateUserById(id: string, attrs: { user_metadata: Record<string, null> }): Promise<{ error: DbErrorLike | null }> } }
}

/** Profile fields a person or a sign-in provider can fill in. All blanked on freeze. */
export const PROFILE_PERSONAL_FIELDS = {
  full_name: null, avatar_url: null, team_name: null, bio: null, college: null, playing_career: null,
  coaching_since: null, certifications: [] as string[], location: null,
  social_twitter: null, social_instagram: null, social_linkedin: null,
}

/** Keys Google, Apple and other providers copy into user_metadata (name, photo, profile). Removed on freeze. */
export const PROVIDER_METADATA_KEYS = [
  'full_name', 'name', 'given_name', 'family_name', 'middle_name', 'nickname', 'preferred_username',
  'user_name', 'avatar_url', 'picture', 'slug', 'birthdate', 'gender', 'locale', 'zoneinfo', 'website', 'profile',
] as const

export type FreezeStep = 'band' | 'profile' | 'player' | 'avatar' | 'metadata'
export type FreezeResult = { ok: boolean; failed: FreezeStep[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function deleteAvatarFiles(db: Db, userId: string): Promise<boolean> {
  if (!UUID_RE.test(userId)) return true
  let ok = true
  // Photos live at avatars/<userId>.<ext> in the private clips bucket; older ones in the old profiles bucket.
  for (const bucket of ['clips', 'profiles']) {
    const store = db.storage.from(bucket)
    const { data, error } = await store.list('avatars', { search: userId, limit: 100 })
    if (error) { if (bucket === 'clips') ok = false; continue }
    const own = (data ?? []).map((f: { name: string }) => f.name)
      .filter((n: string) => n.toLowerCase().startsWith(`${userId.toLowerCase()}.`))
      .map((n: string) => `avatars/${n}`)
    if (own.length === 0) continue
    const { error: removeError } = await store.remove(own)
    if (removeError && bucket === 'clips') ok = false
  }
  return ok
}

/** Blanks the profile, marks it frozen and for deletion (once; times never move). */
async function scrubProfile(db: Db, userId: string, now: string): Promise<boolean> {
  const { error } = await db.from('profiles').update(PROFILE_PERSONAL_FIELDS).eq('id', userId)
  if (error) return false
  for (const col of ['frozen_at', 'deletion_requested_at'] as const) {
    const { error: markError } = await db.from('profiles').update({ [col]: now }).eq('id', userId).is(col, null)
    // Before migration 040 the marks can't be stored; the profile is still blanked.
    if (markError && !isMissingColumnError(markError, col)) return false
    if (markError) console.warn('[freezeUnder13Account] run migration 040 to mark accounts for deletion', { userId })
  }
  return true
}

/** Removes the provider's name and photo from the auth user (the email stays). */
export async function scrubAuthMetadata(db: Db, userId: string): Promise<boolean> {
  const user_metadata = Object.fromEntries(PROVIDER_METADATA_KEYS.map((k) => [k, null])) as Record<string, null>
  const { error } = await db.auth.admin.updateUserById(userId, { user_metadata })
  return !error
}

/**
 * Freezes a signed-in account after an under-13 answer and removes its
 * personal data (see the top of this file). Only a frozen account is
 * blanked: if the freeze itself can't be stored, nothing else runs. After
 * that every step runs even if an earlier one fails; `failed` names the
 * steps that didn't complete.
 */
export async function freezeUnder13Account(db: Db, userId: string): Promise<FreezeResult> {
  const failed: FreezeStep[] = []
  const now = new Date().toISOString()

  const saved = await recordOwnAgeAnswer(db, userId, 'under_13')
  const frozen = 'error' in saved && saved.error === PLAYER_NOT_FOUND
    ? await createOwnPlayerRow(db, { id: userId }, 'under_13', '')
    : saved
  // Already answered under 13 (e.g. a second device): still frozen, carry on.
  // Not frozen (the band couldn't be stored, or an earlier 13+ answer stands):
  // nothing is blanked.
  if ('error' in frozen && !(await isFrozenRow(db, userId))) {
    console.error('[freezeUnder13Account] freeze not stored; nothing blanked', { userId, error: frozen.error })
    return { ok: false, failed: ['band'] }
  }

  if (!(await scrubProfile(db, userId, now))) failed.push('profile')

  const { error: playerError } = await db.from('players').update({ full_name: '', email: null })
    .eq('user_id', userId).is('coach_id', null)
  if (playerError) failed.push('player')

  if (!(await deleteAvatarFiles(db, userId))) failed.push('avatar')
  if (!(await scrubAuthMetadata(db, userId))) failed.push('metadata')

  if (failed.length) console.error('[freezeUnder13Account] steps not completed', { userId, failed })
  return { ok: failed.length === 0, failed }
}

async function isFrozenRow(db: Db, userId: string): Promise<boolean> {
  const { data } = await db.from('players').select('age_band, age_band_self, age_band_coach').eq('user_id', userId).maybeSingle()
  const r = data as { age_band?: string | null; age_band_self?: string | null; age_band_coach?: string | null } | null
  return !!r && r.age_band === 'under_13' && (r.age_band_self === 'under_13' || r.age_band_coach === 'under_13')
}
