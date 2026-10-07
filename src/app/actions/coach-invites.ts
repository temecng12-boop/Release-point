'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/team-coaches'
import { isMissingColumnError } from '@/lib/db-errors'
import { NAME_REQUIRED, toTitleCase } from '@/lib/signup-fields'
import { isPlatformAdmin, isValidInviteEmail, normalizeInviteEmail, platformAdminEmails } from '@/lib/platform-admin'
import { sendCoachInviteEmail } from '@/lib/email'

const NOT_ADMIN = 'Only platform admins can invite coaches.'
const SITE_FALLBACK = 'https://releasepointai.com'

type AdminCheck = { ok: boolean; error?: string; fullName?: string | null }

async function platformAdminCheck(userId: string, email: string | undefined): Promise<AdminCheck> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name, is_platform_admin')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingColumnError(error, 'is_platform_admin')) {
      // Database behind migration 041: the env allowlist is the only gate.
      return { ok: isPlatformAdmin(null, email, platformAdminEmails()) }
    }
    console.error('[inviteCoach] admin check failed', { code: error.code, message: error.message })
    return { ok: false, error: 'Could not check admin access. Please try again.' }
  }
  const row = profile as { role?: string | null; full_name?: string | null; is_platform_admin?: boolean | null } | null
  return { ok: isPlatformAdmin(row, email, platformAdminEmails()), fullName: row?.full_name ?? null }
}

/**
 * Early-access coach invite (platform admins only). The invited coach starts
 * their OWN organization: no team is attached, and nothing of the inviter's
 * roster is shared. Mirrors the player invite (invite.ts): a Supabase invite
 * link is generated (no Supabase email) and sent through Resend.
 *
 * Safe to re-send: a pending invite gets a fresh token + email; an accepted
 * invite, or an email that already has a coach account, gets no email.
 */
export async function inviteCoach(
  _prevState: { error?: string; success?: string; inviteUrl?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string; inviteUrl?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = await platformAdminCheck(user.id, user.email)
  if (admin.error) return { error: admin.error }
  if (!admin.ok) return { error: NOT_ADMIN }

  const email = normalizeInviteEmail((formData.get('coach_email') as string | null) ?? '')
  const fullName = toTitleCase((formData.get('full_name') as string | null) ?? '')
  if (!isValidInviteEmail(email)) return { error: 'Enter a valid email address.' }
  if (!fullName) return { error: NAME_REQUIRED }

  // An email that already has an account is never double-created (ops may
  // have created the coach by hand): coaches get a pointer to login,
  // anything else is refused so roles can't be hijacked by invite.
  const target = await findAuthUserByEmail(email)
  if (target === 'error') return { error: 'Could not look up that email. Please try again.' }
  if (target) {
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', target.id)
      .maybeSingle()
    if (profileError) {
      console.error('[inviteCoach] profile lookup failed', { code: profileError.code, message: profileError.message })
      return { error: 'Could not look up that account. Please try again.' }
    }
    if (!targetProfile) return { error: 'That email already has an account that hasn\u2019t finished setting up. Ask them to sign in, or contact support.' }
    if ((targetProfile as { role?: string }).role === 'coach') {
      return { success: `${email} already has a coach account. No email was sent; they can sign in at /auth/login.` }
    }
    return { error: 'That email belongs to a player or parent account, not a coach. The invite was not sent; contact support to sort it out.' }
  }

  const now = new Date().toISOString()
  const { data: existing, error: inviteReadError } = await supabaseAdmin
    .from('coach_invites')
    .select('id, accepted_at')
    .eq('email', email)
    .maybeSingle()
  if (inviteReadError) {
    console.error('[inviteCoach] invite lookup failed', { code: inviteReadError.code, message: inviteReadError.message })
    return { error: 'Could not check existing invites. Please try again.' }
  }
  if (existing && (existing as { accepted_at?: string | null }).accepted_at) {
    return { success: `${email} already accepted a coach invite. No email was sent; they can sign in at /auth/login.` }
  }

  // Record (or refresh) the invite before generating the link, so a resend
  // rotates the token and a retry never loses the audit row.
  const token = randomUUID()
  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from('coach_invites')
      .update({ invited_by: user.id, token, created_at: now, accepted_at: null })
      .eq('id', (existing as { id: string }).id)
    if (updateError) {
      console.error('[inviteCoach] invite refresh failed', { code: updateError.code, message: updateError.message })
      return { error: 'Could not save the invite. Please try again.' }
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('coach_invites')
      .insert({ email, invited_by: user.id, token })
    if (insertError) {
      // A concurrent invite for the same email wins; the admin can resend.
      if (insertError.code === '23505') return { error: `${email} was just invited. Resend from the dashboard if they never got the email.` }
      console.error('[inviteCoach] invite insert failed', { code: insertError.code, message: insertError.message })
      return { error: 'Could not save the invite. Please try again.' }
    }
  }

  // Supabase invite link (creates the auth user with role coach; sends no
  // email itself). Accepting it lands the coach on /auth/confirm, which
  // marks the invite used and finishes the coach setup (auth/callback).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? SITE_FALLBACK
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { role: 'coach', full_name: fullName },
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  // QA-016 (same as players): an email that gained an account since the
  // lookup gets no setup email, so the message must not promise one.
  const hasAccount = !!linkErr && (linkErr.code === 'email_exists' || linkErr.message.toLowerCase().includes('already'))
  if (linkErr && !hasAccount) {
    console.error('[inviteCoach] invite link failed', { code: linkErr.code, message: linkErr.message })
    return { error: `The invite for ${email} was saved, but the sign-in link could not be created. Resend from the dashboard.` }
  }
  if (hasAccount) {
    revalidatePath('/dashboard')
    return { success: `${email} already has an account. No email was sent; they can sign in at /auth/login.` }
  }

  const inviteUrl = linkData?.properties?.action_link
  if (!inviteUrl) return { error: `The invite for ${email} was saved, but the sign-in link could not be created. Resend from the dashboard.` }

  const { data: { user: inviterUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
  const inviterName = admin.fullName || inviterUser?.user_metadata?.full_name || inviterUser?.email || 'Release Point'
  let sent: { error?: string }
  try {
    sent = await sendCoachInviteEmail({ toEmail: email, coachName: fullName, inviterName: String(inviterName), inviteUrl })
  } catch (err) {
    sent = { error: err instanceof Error ? err.message : 'unknown error' }
  }
  revalidatePath('/dashboard')
  if (sent.error) {
    console.error('[inviteCoach] invite email not sent', sent.error)
    // The sign-in link is still valid: hand it back so it can be copied
    // and sent manually instead of depending on email delivery.
    return { error: `Invite saved for ${email}, but the email could not be sent (${sent.error}). Resend from the dashboard.`, inviteUrl }
  }

  return { success: `Invite sent to ${email}. They\u2019ll set up their own coach account from the email.`, inviteUrl }
}
