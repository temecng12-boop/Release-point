'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendGuardianConsentEmail } from '@/lib/email'
import { PRODUCTION_SITE_URL } from '@/lib/password-reset'
import {
  attachGuardian,
  linkGuardianAccount,
  resolveGuardianForPlayer,
  sendGuardianInvite,
  type InviteDeps,
} from '@/lib/guardian-invite'

const CONSENT_FAILED = 'We couldn\'t record your consent. Please try again. If it keeps happening, contact your coach.'
const NOT_THIS_GUARDIAN = 'We couldn\'t record consent for this player. Ask your coach to check that your email is listed as the guardian.'

// Returns { error } to the form if any step fails; redirects to /guardian
// only after all of them succeeded. Only the guardian on file for this player
// (guardians.user_id = this account, or the same verified email while
// unlinked) may consent. Every write is idempotent, and consent is written
// last: if an earlier step fails, no consent is on file and trying again
// finishes the job.
export async function recordConsent(playerId: string): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const match = await resolveGuardianForPlayer(supabaseAdmin, user, playerId)
  if (!match.ok) {
    if (match.reason === 'failed') return { error: CONSENT_FAILED }
    console.error('[recordConsent] not the guardian on file', { playerId, userId: user.id })
    return { error: NOT_THIS_GUARDIAN }
  }

  // Link the account and set the role (migration 029's rule) before consent.
  if (!(await linkGuardianAccount(supabaseAdmin, user, match.guardian))) return { error: CONSENT_FAILED }

  const { data: consented, error: consentError } = await supabaseAdmin
    .from('players')
    .update({ consent_given_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('guardian_id', match.guardian.id)
    .select('id')
  if (consentError) {
    console.error('[recordConsent] consent write failed', { code: consentError.code, message: consentError.message })
    return { error: CONSENT_FAILED }
  }
  if (!consented || consented.length === 0) {
    // The guardian changed in the meantime, or the player is gone: nothing was recorded.
    console.error('[recordConsent] consent matched no player', { playerId, guardianId: match.guardian.id })
    return { error: NOT_THIS_GUARDIAN }
  }

  revalidatePath('/', 'layout')
  redirect('/guardian')
}

async function inviteDeps(coachId: string): Promise<InviteDeps> {
  const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', coachId).maybeSingle()
  return {
    db: supabaseAdmin,
    generateLink: (args) => supabaseAdmin.auth.admin.generateLink(args as Parameters<typeof supabaseAdmin.auth.admin.generateLink>[0]),
    sendEmail: sendGuardianConsentEmail,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL,
    coachName: (profile as { full_name?: string | null } | null)?.full_name || 'Your coach',
  }
}

export type GuardianActionResult = { success: string } | { error: string; rateLimited?: boolean }

/**
 * The player's coach adds (or changes) the parent or guardian of a player
 * under 13, then the consent email goes out. If the guardian is saved but the
 * email fails, that is an error that says so, never "sent".
 */
export async function saveGuardianForPlayer(
  playerId: string,
  input: { full_name?: string; email?: string },
): Promise<GuardianActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const attached = await attachGuardian(supabaseAdmin, user.id, playerId, input ?? {})
  if ('error' in attached) return { error: attached.error }
  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/profile/${playerId}`)

  const sent = await sendGuardianInvite(await inviteDeps(user.id), user.id, playerId)
  if ('error' in sent) {
    // Same guardian as before: nothing new was saved, so the send result is the answer.
    if (!attached.changed) return sent
    return { error: `Guardian saved, but ${sent.error.charAt(0).toLowerCase()}${sent.error.slice(1)}` }
  }
  return { success: attached.changed ? `Guardian saved. ${sent.success}` : sent.success }
}

/** The coach resends the consent email (rate limited per player). */
export async function resendGuardianInvite(playerId: string): Promise<GuardianActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const result = await sendGuardianInvite(await inviteDeps(user.id), user.id, playerId)
  revalidatePath('/dashboard', 'layout')
  return result
}
