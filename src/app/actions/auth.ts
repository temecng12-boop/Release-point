'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ageBandFields, isMissingAgeBandColumn, writeWithAgeFields } from '@/lib/consent-server'
import { isAgeBand, type AgeBand } from '@/lib/consent'
import { safeRedirectPath } from '@/lib/safe-redirect'
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

export async function signUpPlayer(
  _prevState: { error?: string; sent?: boolean; email?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()

  // The player picks an age band and accepts the Terms (RP-041, 035).
  const band = formData.get('age_band')
  if (!isAgeBand(band)) return { error: 'Choose your age: under 13, 13 to 17, or 18 or older.' }
  if (formData.get('tos') !== 'yes') return { error: 'You must accept the Terms of Service to continue.' }

  const email = formData.get('email') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // adult_confirmed stays for 023's backfill and older code; age_band is 035's.
      data: { role: 'player', full_name: fullName, age_band: band, adult_confirmed: band === '18_plus', tos_accepted_at: new Date().toISOString() },
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

  // ?next= from the login URL (e.g. a guardian's consent link); same-site paths only.
  redirect(safeRedirectPath(formData.get('next'), '/dashboard'))
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
  const role     = (meta.role ?? 'player') as string
  const fullName = (meta.full_name ?? '') as string
  const now      = new Date().toISOString()

  // Ensure profile row exists. A guardian invite's account starts as 'player';
  // 'guardian' is only granted server-side on the consent page (migration 029).
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName, role: role === 'guardian' ? 'player' : role }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) {
    console.error('[linkPlayerRow] profile upsert failed', { code: profileError.code, message: profileError.message })
    return { error: LINK_FAILED }
  }
  if (typeof meta.tos_accepted_at === 'string' && !(await recordTosAcceptance(user.id, meta.tos_accepted_at))) {
    return { error: LINK_FAILED }
  }

  // Parents invited to give consent never get a players row.
  if (role !== 'player') return { success: true }

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

  // No invite: a parent who signed in with an email link (no role chosen at
  // signup) and whose email a coach entered as a guardian is not a player.
  if ((!linked || linked.length === 0) && !meta.role) {
    const { data: asGuardian, error: guardianError } = await supabaseAdmin
      .from('guardians')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .limit(1)
    if (guardianError) {
      console.error('[linkPlayerRow] guardian lookup failed', { code: guardianError.code, message: guardianError.message })
      return { error: LINK_FAILED }
    }
    if (asGuardian && asGuardian.length > 0) return { success: true }
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
      // Age band from the self-signup form (RP-041, 035); older signups only
      // carry adult_confirmed = true (18+). No guardian consent is recorded
      // here. Before 035/023 the row is created with the columns that exist
      // (see writeWithAgeFields).
      const band: AgeBand | null = isAgeBand(meta.age_band) ? meta.age_band : meta.adult_confirmed === true ? '18_plus' : null
      const fields = band ? ageBandFields(band, user.id, now) : null
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
