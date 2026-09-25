'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWaitlistNotification } from '@/lib/email'

export async function joinWaitlist(data: { email: string; name: string }) {
  const email = data.email.trim().toLowerCase()
  const name  = data.name.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }

  // Best-effort DB insert — may fail if table doesn't exist yet
  const { error: dbError } = await supabaseAdmin
    .from('waitlist')
    .insert({ email, name: name || null })

  if (dbError?.code === '23505') {
    return { error: "You're already on the list — we'll be in touch!" }
  }

  // Always send email notification so no signups are lost
  try {
    await sendWaitlistNotification({ email, name: name || null })
  } catch {
    // email is non-critical
  }

  return { success: true }
}
