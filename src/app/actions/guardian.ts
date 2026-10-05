'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PARENT_CONSENT_UNAVAILABLE } from '@/lib/under13-mode'

// Parent consent can't be given in the app yet (compliance spec P1). The old
// one-click consent never verified a parent, so this no longer writes
// consent_given_at or changes any guardian, profile or role. In PR B it
// becomes a submission that an admin reviews and approves; only that
// approval will set consent. Kept so a stale consent page gets a clear error.
export async function recordConsent(playerId: string): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  console.warn('[recordConsent] refused: parent consent is not available yet', { userId: user.id, playerId })
  return { error: PARENT_CONSENT_UNAVAILABLE }
}
