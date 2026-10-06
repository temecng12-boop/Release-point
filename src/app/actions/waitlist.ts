'use server'

import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWaitlistNotification } from '@/lib/email'
import {
  WAITLIST_INVALID_EMAIL,
  WAITLIST_RATE_LIMITED,
  clientIpFromHeaders,
  isValidWaitlistEmail,
  normalizeWaitlistEmail,
  normalizeWaitlistName,
  waitlistJoinOutcome,
  waitlistRateLimited,
} from '@/lib/waitlist'

export async function joinWaitlist(data: { email: string; name: string }) {
  const email = normalizeWaitlistEmail(data.email ?? '')
  const name = normalizeWaitlistName(data.name ?? '')

  if (!email || !isValidWaitlistEmail(email)) {
    return { error: WAITLIST_INVALID_EMAIL }
  }

  // Best-effort per-instance bucket (IP + email). Blocks unique-email floods and
  // Resend spam to the founder inbox. Not shared across Vercel instances — see
  // waitlist-traffic-audit.md. No Upstash in this stack.
  const h = await headers()
  const ip = clientIpFromHeaders(h)
  if (waitlistRateLimited(`ip:${ip}`) || waitlistRateLimited(`email:${email}`)) {
    return { error: WAITLIST_RATE_LIMITED }
  }

  // Schema (015_waitlist.sql): id uuid PK, email text UNIQUE NOT NULL, name text,
  // created_at timestamptz. Service role only (RLS on, no anon/authenticated policies).
  const { error: dbError } = await supabaseAdmin
    .from('waitlist')
    .insert({ email, name })

  let emailOk = false
  try {
    await sendWaitlistNotification({ email, name })
    emailOk = true
  } catch (err) {
    console.error('[joinWaitlist] founder notification failed', err)
  }

  const outcome = waitlistJoinOutcome({ dbError, emailOk })
  if ('error' in outcome) {
    console.error('[joinWaitlist] insert failed', {
      code: dbError?.code ?? null,
      message: dbError?.message ?? null,
      emailOk,
    })
  }
  return outcome
}
