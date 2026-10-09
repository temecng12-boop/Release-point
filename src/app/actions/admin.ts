'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendCoachApprovalEmail } from '@/lib/email'
import { requirePlatformAdmin } from '@/lib/platform-admin-server'
import { isValidInviteEmail, normalizeInviteEmail } from '@/lib/platform-admin'
import { buildInviteAcceptUrl } from '@/lib/invite-accept-link'

export async function approveWaitlistAsCoach(
  waitlistId: string,
  email: string,
  name: string | null,
): Promise<{ error?: string; success?: true }> {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return { error: gate.error }

  const normalized = normalizeInviteEmail(email)
  if (!isValidInviteEmail(normalized)) return { error: 'That email is not valid.' }

  // Invite-only hook (042) rejects generateLink unless coach_invites or
  // players already has this email. Write the row first.
  const { error: inviteErr } = await supabaseAdmin
    .from('coach_invites')
    .insert({ email: normalized, invited_by: gate.user.id })
  if (inviteErr && inviteErr.code !== '23505') {
    console.error('[approveWaitlistAsCoach] coach_invites insert failed', inviteErr)
    return { error: 'Could not create the invite record. Please try again.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: normalized,
    options: {
      data: { role: 'coach' },
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  })
  if (linkErr) return { error: linkErr.message }

  const inviteUrl = linkData?.properties?.hashed_token
    ? buildInviteAcceptUrl(siteUrl, linkData.properties.hashed_token, '/dashboard')
    : undefined
  if (!inviteUrl) return { error: 'Could not generate invite link' }

  const sent = await sendCoachApprovalEmail({ toEmail: normalized, name: name ?? undefined, inviteUrl })
  if (sent && 'error' in sent && sent.error) {
    return { error: `Invite record created but the email could not be sent: ${sent.error}` }
  }

  const { error: markErr } = await supabaseAdmin
    .from('waitlist')
    .update({ approved_at: new Date().toISOString(), invite_sent_at: new Date().toISOString() })
    .eq('id', waitlistId)
  if (markErr) {
    console.error('[approveWaitlistAsCoach] waitlist update failed', markErr)
    return { error: 'Invite sent, but the waitlist row could not be marked approved. Refresh and check.' }
  }

  revalidatePath('/admin/waitlist')
  return { success: true }
}
