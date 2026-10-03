'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { submitFeedback, type FeedbackInput, type FeedbackResult } from '@/lib/feedback/submit'

// "Report a problem" (src/components/report-problem.tsx). Uses the signed-in
// user's own session; RLS (028) allows inserting their own rows only.
export async function submitFeedbackReport(input: FeedbackInput): Promise<FeedbackResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return submitFeedback(supabase, user ? { id: user.id, email: user.email } : null, input, {
    userAgent: h.get('user-agent'),
    origin: host ? `${proto}://${host}` : null,
    env: {
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    },
  })
}
