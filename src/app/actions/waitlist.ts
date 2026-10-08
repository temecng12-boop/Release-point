'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWaitlistNotification } from '@/lib/email'

export async function joinWaitlist(data: {
  email: string
  name: string
  role?: string
  programName?: string
  athleteCount?: string
  tech?: string
  referral?: string
}) {
  const email = data.email.trim().toLowerCase()
  const name  = data.name.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }

  const payload: Record<string, string | null> = {
    email,
    name:          name || null,
    role:          data.role          || null,
    program_name:  data.programName   || null,
    athlete_count: data.athleteCount  || null,
    tech_stack:    data.tech          || null,
    referral:      data.referral      || null,
  }

  // Best-effort DB insert — qualifying columns may not exist yet if migration hasn't run
  const { error: dbError } = await supabaseAdmin.from('waitlist').insert(payload)

  if (dbError?.code === '23505') {
    return { error: "You're already on the list — we'll be in touch!" }
  }

  // If columns are missing, fall back to base insert so no one is lost
  if (dbError) {
    await supabaseAdmin.from('waitlist').insert({ email, name: name || null })
  }

  // Always send email notification so no signups are lost regardless of DB outcome
  try {
    await sendWaitlistNotification({
      email,
      name:         name || null,
      role:         data.role         || null,
      programName:  data.programName  || null,
      athleteCount: data.athleteCount || null,
      tech:         data.tech         || null,
      referral:     data.referral     || null,
    })
  } catch {
    // email is non-critical
  }

  return { success: true }
}
