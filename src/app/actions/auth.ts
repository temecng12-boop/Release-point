'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeWithAdultFields } from '@/lib/consent-server'
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: 'coach', full_name: fullName } },
  })

  if (error) return { error: error.message }

  if (data.user) {
    // linkPlayerRow writes role 'player' for any profile it touches, so a coach
    // whose profile row isn't saved here could end up as a player. Don't send
    // them to the dashboard as if signup worked.
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name: fullName || '', role: 'coach' })
    if (profileError) {
      console.error('[signUp] coach profile upsert failed', data.user.id, profileError.code, profileError.message)
      return { error: 'Your account was created, but we couldn\'t finish setting it up as a coach account. Please try signing in again in a few minutes. If your dashboard shows a player account, contact support.' }
    }
  }

  redirect('/dashboard')
}

export async function signUpPlayer(
  _prevState: { error?: string; sent?: boolean; email?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()

  // Self-signup is for players 18 and older; younger players join through their coach.
  if (formData.get('adult_confirmed') !== 'yes') {
    return { error: 'You must be 18 or older to sign up yourself. Players under 18 join through their coach.' }
  }

  const email = formData.get('email') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { role: 'player', full_name: fullName, adult_confirmed: true },
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

  const fullName = (user.user_metadata?.full_name ?? '') as string
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
      // 18+ confirmation from the self-signup form (RP-041). No guardian
      // consent is recorded here.
      // Before migration 023 the adult columns don't exist; the row is then
      // created without them (see writeWithAdultFields).
      const adultConfirmed = user.user_metadata?.adult_confirmed === true
      const { error: insertError } = await writeWithAdultFields(
        adultConfirmed ? { adult_confirmed_at: now, adult_confirmed_by: user.id } : {},
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
