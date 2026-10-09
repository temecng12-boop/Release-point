'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendAssistantCoachInviteEmail } from '@/lib/email'
import { buildInviteAcceptUrl } from '@/lib/invite-accept-link'

export async function inviteAssistantCoach(
  _prev: { error?: string; success?: string; inviteUrl?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string; inviteUrl?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const teamId    = (formData.get('team_id')    as string | null)?.trim()
  const email     = ((formData.get('coach_email') as string | null) ?? '').trim().toLowerCase()
  const coachName = ((formData.get('coach_name')  as string | null) ?? '').trim()

  if (!teamId || !email) return { error: 'Team and email are required' }

  // Only the team organizer can invite coaches
  const { data: membership } = await supabaseAdmin
    .from('team_coaches')
    .select('role')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .maybeSingle()

  if (membership?.role !== 'organizer') return { error: 'Only the team organizer can invite coaches' }

  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    supabaseAdmin.from('teams').select('name').eq('id', teamId).single(),
    supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  const inviterName = (inviterProfile as { full_name?: string | null } | null)?.full_name ?? 'Your coach'
  const teamName   = (team as { name?: string | null } | null)?.name ?? 'the team'

  // Insert into coach_invites so the invite gate allows this email through.
  // The unique index is on lower(email), so we insert and ignore duplicate-key
  // errors (23505) rather than upsert — PostgREST can't target functional indexes.
  const { error: inviteErr } = await supabaseAdmin
    .from('coach_invites')
    .insert({ email, invited_by: user.id })

  if (inviteErr && inviteErr.code !== '23505') {
    console.error('[inviteAssistantCoach] coach_invites insert failed', inviteErr)
    return { error: 'Failed to create invite record. Please try again.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { role: 'coach' },
      redirectTo: `${siteUrl}/auth/confirm?join_team=${teamId}`,
    },
  })

  if (linkErr && !linkErr.message.toLowerCase().includes('already')) {
    return { error: `Invite record created but link generation failed: ${linkErr.message}` }
  }

  const inviteUrl = linkData?.properties?.hashed_token
    ? (() => {
        const url = new URL(buildInviteAcceptUrl(siteUrl, linkData.properties.hashed_token, '/dashboard'))
        url.searchParams.set('join_team', teamId)
        return url.toString()
      })()
    : undefined
  if (!inviteUrl) return { error: 'Could not create the invite link. Please try again.' }

  await sendAssistantCoachInviteEmail({
    toEmail: email,
    coachName: coachName || undefined,
    inviterName,
    teamName,
    inviteUrl,
  })

  revalidatePath(`/dashboard/team/${teamId}`)
  return {
    success: `Invite sent to ${email}! ${coachName ? `${coachName} will` : 'They will'} receive an email to join ${teamName}.`,
    inviteUrl,
  }
}
