'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { ageAnswerFields, isMissingAgeBandColumn, recordOwnAgeAnswer, writeWithAgeFields } from '@/lib/consent-server'
import { AGE_STOP_COOKIE, bandFromBirth, isAgeBand, type AgeBand } from '@/lib/age-band'
import { parentConsentFlowEnabled } from '@/lib/under13-mode'
import { setAgeStopCookie } from '@/lib/age-stop-cookie'
import { deleteAccountFlow } from '@/lib/account-deletion'
import { passwordProblem } from '@/lib/password-rule'
import { PRODUCTION_SITE_URL } from '@/lib/password-reset'
import { supabaseDeletionDb, supabaseDeletionStorage } from '@/lib/account-deletion-supabase'

function toTitleCase(s: string) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

export async function signUp(_prevState: { error?: string; message?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  if (!formData.get('tos')) return { error: 'You must accept the Terms of Service to continue.' }

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

  if (error) return { error: error.message }

  if (data.user) {
    await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name: fullName || '', role: 'coach' })
    await recordTosAcceptance(data.user.id, tosAcceptedAt)
  }

  redirect('/dashboard')
}

/**
 * Step 1 of player self-signup: the neutral birth month/year screen, before
 * any other field (spec T1). Nothing is stored. Under 13: the stop message
 * and the session cookie that blocks another answer (hard stop). signUpPlayer
 * checks the same answer again.
 */
export async function checkSignupAge(
  _prevState: { error?: string; ok?: boolean; stopped?: boolean; month?: string; year?: string } | undefined,
  formData: FormData,
) {
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }
  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }
  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    setAgeStopCookie(jar)
    return { stopped: true }
  }
  return { ok: true, month: String(formData.get('birth_month')), year: String(formData.get('birth_year')).trim() }
}

export async function signUpPlayer(
  _prevState: { error?: string; sent?: boolean; email?: string; stopped?: boolean } | undefined,
  formData: FormData
) {
  // Neutral age screen (spec T1): birth month and year, turned into a band
  // here; the month and year are never stored. Under 13 is a hard stop for
  // now (src/lib/under13-mode.ts): no account, nothing stored, and a session
  // cookie blocks trying again with another age.
  const jar = await cookies()
  if (jar.get(AGE_STOP_COOKIE)) return { stopped: true }
  const parsed = bandFromBirth(formData.get('birth_month'), formData.get('birth_year'))
  if (!parsed.ok) return { error: parsed.error }
  if (parsed.band === 'under_13' && !parentConsentFlowEnabled()) {
    setAgeStopCookie(jar)
    return { stopped: true }
  }
  if (formData.get('tos') !== 'yes') return { error: 'You must accept the Terms of Service to continue.' }

  const email = formData.get('email') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Only the band and when it was answered (037); linkPlayerRow stores them.
      data: { role: 'player', full_name: fullName, age_band: parsed.band, age_screen_at: now, tos_accepted_at: now },
      // Same fallback as invite and reset emails: an unset variable never sends links to localhost.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL}/auth/confirm`,
    },
  })

  if (error) return { error: error.message }

  return { sent: true, email }
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
  if (typeof meta.tos_accepted_at === 'string' && !(await recordTosAcceptance(user.id, meta.tos_accepted_at))) {
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

  // The self-signup age answer (band only) for an invited email: stored as the
  // player's answer; the younger of it and the coach's wins (037). If it
  // can't be stored, the age screen asks again at the next page load.
  const selfBand: AgeBand | null = isAgeBand(meta.age_band) ? meta.age_band : null
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
      // The self-signup age answer (band only; RP-041, 037); older signups
      // only carry adult_confirmed = true (18+). Before 037/023 the row is
      // created with the columns that exist (see writeWithAgeFields).
      const band: AgeBand | null = selfBand ?? (meta.adult_confirmed === true ? '18_plus' : null)
      const answeredAt = typeof meta.age_screen_at === 'string' && !Number.isNaN(Date.parse(meta.age_screen_at)) ? meta.age_screen_at : now
      const fields = band ? ageAnswerFields('self', band, user.id, {}, now) : null
      if (fields && selfBand) fields.age.age_screen_at = answeredAt
      if (fields && !selfBand) delete fields.age.age_screen_at
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
 * Stores when the account accepted the Terms (profiles.tos_accepted_at, 035),
 * once. Before 035 the column doesn't exist; the acceptance is still in the
 * account's signup metadata. Returns false only on a real write failure.
 */
async function recordTosAcceptance(userId: string, acceptedAt: string): Promise<boolean> {
  if (Number.isNaN(Date.parse(acceptedAt))) return true
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ tos_accepted_at: acceptedAt })
    .eq('id', userId)
    .is('tos_accepted_at', null)
  if (error && !isMissingAgeBandColumn(error)) {
    console.error('[recordTosAcceptance] failed', { code: error.code, message: error.message })
    return false
  }
  return true
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
