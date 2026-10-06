// Server only. Used by the OAuth callback (/auth/callback) after a Google or
// Apple sign-in:
//   * applyOAuthSignupAge: the signup page asked the birth month and year and
//     the Terms before showing the Google and Apple buttons, and left a
//     signed 15-minute cookie (startOAuthSignup). Here that answer is stored
//     once for a player account that hasn't answered yet, so the age screen
//     isn't shown again;
//   * rescrubFrozenAccount: a frozen under-13 account that signs in again with
//     Google or Apple gets the provider's name and photo copied back into its
//     auth metadata by Supabase; they're removed again.
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyOAuthAge } from './signup-age-token'
import { recordTermsAcceptance } from './terms-acceptance'
import { createOwnPlayerRow, PLAYER_NOT_FOUND, recordOwnAgeAnswer, selectPlayersWithConsent } from './consent-server'
import { isFrozenUnder13, needsAgeConfirm, type PlayerConsentFields } from './consent'
import { scrubAuthMetadata } from './under13-freeze'

type Db = Pick<SupabaseClient, 'from'>
type OAuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }

export type OAuthAgeOutcome = 'stored' | 'no_token' | 'invalid' | 'not_player' | 'already_answered' | 'failed'

export async function applyOAuthSignupAge(db: Db, user: OAuthUser, token: string | null | undefined): Promise<OAuthAgeOutcome> {
  if (!token) return 'no_token'
  const claims = verifyOAuthAge(token)
  if (!claims) return 'invalid'

  const { data: profile, error: profileError } = await db.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
  if (profileError) { console.error('[applyOAuthSignupAge] profile read failed', { userId: user.id, code: profileError.code ?? null }); return 'failed' }
  const p = profile as { role?: string | null; full_name?: string | null } | null
  if (p?.role !== 'player') return 'not_player'

  const { data: player, error: playerError } = await selectPlayersWithConsent<PlayerConsentFields>(
    'id',
    (cols) => db.from('players').select(cols).eq('user_id', user.id).maybeSingle(),
  )
  if (playerError) { console.error('[applyOAuthSignupAge] player read failed', { userId: user.id, code: playerError.code ?? null }); return 'failed' }
  if (player && !needsAgeConfirm(player)) return 'already_answered'

  if (!(await recordTermsAcceptance(db, user.id, claims.tosAcceptedAt, claims.tosVersion))) return 'failed'
  let saved = await recordOwnAgeAnswer(db, user.id, claims.band)
  if ('error' in saved && saved.error === PLAYER_NOT_FOUND) {
    const meta = user.user_metadata ?? {}
    const fullName = p?.full_name || (typeof meta.full_name === 'string' ? meta.full_name : '') || (typeof meta.name === 'string' ? meta.name : '')
    saved = await createOwnPlayerRow(db, user, claims.band, fullName)
  }
  if ('error' in saved) return 'failed'
  return 'stored'
}

export async function rescrubFrozenAccount(db: Db & Parameters<typeof scrubAuthMetadata>[0], userId: string): Promise<boolean> {
  const { data } = await selectPlayersWithConsent<PlayerConsentFields>(
    'id',
    (cols) => db.from('players').select(cols).eq('user_id', userId).maybeSingle(),
  )
  if (!isFrozenUnder13(data)) return false
  await scrubAuthMetadata(db, userId)
  return true
}
