'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { ageAnswerFields, recordOwnAgeAnswer, writeWithAgeFields } from '@/lib/consent-server'
import { recordTermsAcceptance } from '@/lib/terms-acceptance'
import { NAME_REQUIRED, TOS_REQUIRED, toTitleCase } from '@/lib/signup-fields'
import { AGE_STOP_COOKIE, bandFromBirth, type AgeBand } from '@/lib/age-band'
import { OAUTH_AGE_COOKIE, OAUTH_AGE_MAX_AGE_SECONDS, signOAuthAge, signSignupAge, verifySignupAge } from '@/lib/signup-age-token'
import { TERMS_VERSION } from '@/lib/terms-version'
import { parentConsentFlowEnabled } from '@/lib/under13-mode'
import { setAgeStopCookie } from '@/lib/age-stop-cookie'
import { deleteAccountFlow } from '@/lib/account-deletion'
import { passwordProblem } from '@/lib/password-rule'
import { isRateLimited, PRODUCTION_SITE_URL } from '@/lib/password-reset'
import { supabaseDeletionDb, supabaseDeletionStorage } from '@/lib/account-deletion-supabase'

export async function signUp(_prevState: { error?: string; message?: string; stopped?: boolean } | undefined, formData: FormData) {
  // Same 24-hour stop as player signup (an under-13 answer in this browser):
  // refused before anything else, nothing read, stored or logged.
  if ((await cookies()).get(AGE_STOP_COOKIE)) return { stopped: true }
  const supabase = await createClient()

  if (!formData.get('tos')) return { error: TOS_REQUIRED }

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  // Same rule as the form; checked here too because the browser check can be skipped.
  const problem = passwordProblem(password)
  if (problem) return { error: problem }

  const tosAcceptedAt = new Date().toISOString()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: 'coach', full_name: fullName, tos_accepted_at: tosAcceptedAt } },
  })

  if (error) {
    console.error('[signUp] coach signup failed', { code: error.code ?? null, message: error.message, status: error.status ?? null })
    if (isRateLimited(error)) {
      return { error: "You've tried a few times in a short span. Please wait a minute and try again." }
    }
    return { error: "We couldn't create your account. Check your details and try again." }
  }

  if (data.user) {
    // linkPlayerRow writes role 'player' for any profile it touches, so a coach
    // whose profile row isn't saved here could end up as a player. Don't send
    // them to the dashboard as if signup worked.
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name: fullName || '', role: 'coach' })
    if (profileError) {
      console.error('[signUp] coach profile upsert failed', data.user.id, profileError.code, profileError.message)
      return { error: 'Your account was created, but we couldn\'t finish setting it up as a coach account. Please try signing in again in a few minutes. If your dashboard shows a player account, contact support.' }
    }
    if (!(await recordTermsAcceptance(supabaseAdmin, data.user.id, tosAcceptedAt, TERMS_VERSION))) {
      return { error: 'Your account was created, but your Terms acceptance couldn\'t be saved. Please sign in again in a few minutes.' }
    }
  }

  redirect('/dashboard')
}

export type SignUpPlayerState = { error?: string; sent?: boolean; email?: string; stopped?: boolean } | undefined

/**
 * Player self-signup, one screen: birth month and year, name, email and the
 * Terms in one form (spec T1).
 *
 * The age is checked first, on the server, before any other field is read:
 *   * the 24-hour stop cookie refuses every submission, whatever the form
 *     says (a back-button resubmit included);
 *   * under 13 (hard stop, src/lib/under13-mode.ts): no Supabase call at all,
 *     nothing stored or logged (not the name, not the email), and the cookie
 *     is set. The month and year are never stored for anyone.
 * 13 or older: a sign-in link is sent. The band, the answer time and the
 * Terms acceptance travel in the link's metadata as a token signed by the
 * server and bound to this email; linkPlayerRow stores only what verifies,
 * once, and it never changes afterwards.
 */
export async function signUpPlayer(_prevState: SignUpPlayerState, formData: FormData): Promise<SignUpPlayerState> {
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }
  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }
  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    setAgeStopCookie(jar)
    return { stopped: true }
  }

  if (formData.get('tos') !== 'yes') return { error: TOS_REQUIRED }
  const email = String(formData.get('email') ?? '').trim()
  const fullName = toTitleCase(String(formData.get('full_name') ?? ''))
  if (!fullName) return { error: NAME_REQUIRED }
  if (!email) return { error: 'Enter your email address.' }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { role: 'player', full_name: fullName, signup_age: signSignupAge(email, { band: parsed.band, answeredAt: now, tosAcceptedAt: now, tosVersion: TERMS_VERSION }) },
      // Same fallback as invite and reset emails: an unset variable never sends links to localhost.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL}/auth/confirm`,
    },
  })

  if (error) {
    console.error('[signUpPlayer] sign-in link failed', { code: error.code ?? null, message: error.message })
    return { error: "We couldn't send your sign-in link. Check the email address and try again." }
  }

  return { sent: true, email }
}

export type OAuthSignupState = { error?: string; ready?: boolean; stopped?: boolean } | undefined

/**
 * The step before the Google and Apple buttons on the signup page: birth
 * month and year and the Terms, checked here first. Same order as
 * signUpPlayer:
 *   * the 24-hour stop cookie refuses every submission;
 *   * under 13: the cookie is set and the stop message shown. No Supabase
 *     call, no OAuth, nothing stored or logged;
 *   * 13 or older: the answer and the Terms acceptance go in a signed,
 *     15-minute, httpOnly cookie that the OAuth callback stores once (so the
 *     age screen isn't shown again), and the buttons appear.
 */
export async function startOAuthSignup(_prev: OAuthSignupState, formData: FormData): Promise<OAuthSignupState> {
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }
  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }
  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    setAgeStopCookie(jar)
    return { stopped: true }
  }
  if (formData.get('tos') !== 'yes') return { error: TOS_REQUIRED }

  const now = new Date().toISOString()
  const token = signOAuthAge({ band: parsed.band, answeredAt: now, tosAcceptedAt: now, tosVersion: TERMS_VERSION })
  if (!token) {
    // No server key: the person answers the one screen after signing in instead.
    console.warn('[startOAuthSignup] no signing key; the age screen will ask after sign-in')
    return { ready: true }
  }
  jar.set(OAUTH_AGE_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: OAUTH_AGE_MAX_AGE_SECONDS })
  return { ready: true }
}

export async function signIn(_prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  // Sign out this device only; other devices stay signed in (QA-012).
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/auth/login')
}

// Links the signed-in player to their invited player row (or creates one).
// Returns { error } if a step failed, so the confirm page can say so and offer
// a retry; every step is safe to run again. The sign-in itself is not undone.
const LINK_FAILED = 'You\'re signed in, but we couldn\'t connect your account to your player profile. Try again, or contact your coach if it keeps happening.'

export async function linkPlayerRow(): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error('[linkPlayerRow] no session after sign-in', userError?.message)
    return { error: LINK_FAILED }
  }
  if (!user.email) return { success: true }

  const meta     = user.user_metadata ?? {}
  const fullName = (meta.full_name ?? '') as string
  const now      = new Date().toISOString()

  // Ensure profile row exists. user_metadata is client-controlled (anyone can
  // call auth.signUp with any metadata), so a missing profile is always
  // created as 'player'; coach and guardian roles are only set server-side.
  // An existing profile is never changed.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName, role: 'player' }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) {
    console.error('[linkPlayerRow] profile upsert failed', { code: profileError.code, message: profileError.message })
    return { error: LINK_FAILED }
  }
  // The signup age answer and Terms acceptance, only if signed by
  // signUpPlayer for this email. Forged metadata (age_band, adult_confirmed,
  // tos_accepted_at, a bad signup_age) is ignored: the player answers the age
  // screen on their first visit instead.
  const signup = verifySignupAge(meta.signup_age, user.email)
  if (signup && !(await recordTermsAcceptance(supabaseAdmin, user.id, signup.tosAcceptedAt, signup.tosVersion))) {
    return { error: LINK_FAILED }
  }

  // Only player accounts are linked to a player row; go by the stored role.
  const { data: profile, error: roleError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (roleError || !profile) {
    console.error('[linkPlayerRow] profile role lookup failed', { code: roleError?.code, message: roleError?.message })
    return { error: LINK_FAILED }
  }
  if (profile.role !== 'player') return { success: true }

  // Link to an existing invited player record. Accepting an invite is not
  // guardian consent, and the coach's age choice from the invite stands.
  const { data: linked, error: linkError } = await supabaseAdmin
    .from('players')
    .update({ user_id: user.id, accepted_at: now })
    .eq('email', user.email)
    .is('user_id', null)
    .select('id')
  if (linkError) {
    console.error('[linkPlayerRow] invite link failed', { code: linkError.code, message: linkError.message })
    return { error: LINK_FAILED }
  }

  // The verified self-signup answer (band only) for an invited email: stored
  // as the player's answer; the younger of it and the coach's wins (037). If
  // it can't be stored, the age screen asks again at the next page load.
  const selfBand: AgeBand | null = signup?.band ?? null
  if (linked && linked.length > 0 && selfBand) {
    const answered = await recordOwnAgeAnswer(supabaseAdmin, user.id, selfBand)
    if ('error' in answered) console.warn('[linkPlayerRow] signup age answer not stored', { userId: user.id, error: answered.error })
  }

  // No invite — create a standalone player row
  if (!linked || linked.length === 0) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
    if (existingError) {
      console.error('[linkPlayerRow] player lookup failed', { code: existingError.code, message: existingError.message })
      return { error: LINK_FAILED }
    }

    if (!existing || existing.length === 0) {
      // The verified self-signup answer (band only; RP-041, 037). Before
      // 037/023 the row is created with the columns that exist (see
      // writeWithAgeFields).
      const band: AgeBand | null = selfBand
      const fields = band ? ageAnswerFields('self', band, user.id, {}, now) : null
      if (fields && signup) fields.age.age_screen_at = signup.answeredAt
      const { result: { error: insertError } } = await writeWithAgeFields(
        fields?.age ?? {},
        band === '18_plus' && fields ? fields.adult : {},
        (adultFields) => supabaseAdmin.from('players').insert({
          user_id:     user.id,
          full_name:   fullName,
          email:       user.email,
          accepted_at: now,
          ...adultFields,
        }),
      )
      if (insertError) {
        console.error('[linkPlayerRow] player insert failed', { code: insertError.code, message: insertError.message })
        return { error: LINK_FAILED }
      }
    }
  }
  return { success: true }
}

/**
 * Delete the signed-in user's account on the server: clean up their rows and
 * storage files with the service client (policy: src/lib/account-deletion.ts),
 * then delete the auth user and sign out. Returns { error } and leaves the
 * session in place if any step fails; redirects to login only on full success.
 * If the account was deleted but some storage files couldn't be removed, the
 * leftover paths are logged and { warning } is returned instead of a redirect.
 */
export async function deleteAccount(): Promise<{ error: string } | { warning: string } | undefined> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return { error: 'Your session has expired. Sign in again, then try deleting your account.' }

  const result = await deleteAccountFlow({
    userId: user.id,
    email: user.email,
    db: supabaseDeletionDb(supabaseAdmin),
    storage: supabaseDeletionStorage(supabaseAdmin),
    deleteAuthUser: (id) => supabaseAdmin.auth.admin.deleteUser(id),
  })
  if (!result.ok) {
    console.error('[deleteAccount] failed', { userId: user.id, step: result.step, error: result.detail, leftoverFiles: result.leftoverFiles ?? [] })
    return { error: result.error }
  }
  const { plan } = result
  console.info('[deleteAccount] deleted', {
    userId: user.id,
    deletedPlayers: plan.deletePlayerIds.length,
    detachedPlayers: plan.detachCoachPlayerIds.length,
    transferredTeams: plan.transferTeams.length,
    deletedTeams: plan.deleteTeamIds.length,
    reassignedClips: plan.reassignClips.reduce((n, g) => n + g.ids.length, 0),
    deletedClips: plan.deleteClipIds.length,
    removedFiles: result.removedFiles,
    skipped: result.log,
  })

  // Account deleted: end every session of this account, on all devices.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signOutError) console.warn('[deleteAccount] signOut after delete', { userId: user.id, error: signOutError.message })
  if (result.warning) {
    // Rows and login are gone, but some files are still in storage: log them for cleanup and say so.
    console.error('[deleteAccount] storage files left after delete', { userId: user.id, leftoverFiles: result.leftoverFiles })
    return { warning: result.warning }
  }
  redirect('/auth/login')
}
