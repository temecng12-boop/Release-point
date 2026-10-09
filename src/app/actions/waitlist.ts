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

export async function joinWaitlist(data: {
  email: string
  name: string
  role?: string
  programName?: string
  athleteCount?: string
  tech?: string
  referral?: string
}) {
  const email = normalizeWaitlistEmail(data.email ?? '')
  const name = normalizeWaitlistName(data.name ?? '')

  if (!email || !isValidWaitlistEmail(email)) {
    return { error: WAITLIST_INVALID_EMAIL }
  }

  const h = await headers()
  const ip = clientIpFromHeaders(h)
  if (waitlistRateLimited(`ip:${ip}`) || waitlistRateLimited(`email:${email}`)) {
    return { error: WAITLIST_RATE_LIMITED }
  }

  const extras: Record<string, string> = {}
  if (data.role) extras.role = data.role
  if (data.programName) extras.program_name = data.programName
  if (data.athleteCount) extras.athlete_count = data.athleteCount
  if (data.tech) extras.tech_stack = data.tech
  if (data.referral) extras.referral = data.referral

  const { error: dbError } = await supabaseAdmin
    .from('waitlist')
    .insert({ email, name, ...extras })

  let emailOk = false
  try {
    await sendWaitlistNotification({
      email,
      name,
      role: data.role ?? null,
      programName: data.programName ?? null,
      athleteCount: data.athleteCount ?? null,
      tech: data.tech ?? null,
      referral: data.referral ?? null,
    })
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
