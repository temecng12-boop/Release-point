'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendCoachApprovalEmail } from '@/lib/email'

const ADMIN_EMAIL = 'temecng12@gmail.com'

export async function approveWaitlistAsCoach(
  waitlistId: string,
  email: string,
  name: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) return { error: 'Unauthorized' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { role: 'coach' },
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (linkErr) return { error: linkErr.message }

  const inviteUrl = linkData?.properties?.action_link
  if (!inviteUrl) return { error: 'Could not generate invite link' }

  try {
    await sendCoachApprovalEmail({ toEmail: email, name: name ?? undefined, inviteUrl })
  } catch {
    // email non-critical
  }

  // Mark as approved — graceful if columns don't exist yet
  await supabaseAdmin
    .from('waitlist')
    .update({ approved_at: new Date().toISOString(), invite_sent_at: new Date().toISOString() })
    .eq('id', waitlistId)

  revalidatePath('/admin/waitlist')
  return { success: true }
}
