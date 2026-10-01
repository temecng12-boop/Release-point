import { createClient } from '@/lib/supabase/server'
import { hasRecoverySession, RESET_LINK_INVALID, RESET_NO_SESSION } from '@/lib/password-reset'
import ResetForm from './reset-form'

export const dynamic = 'force-dynamic'

// /auth/reset: reached from a password reset email (via /auth/confirm and
// /auth/callback). Without a recovery session, or with ?error from an expired
// or used link, it explains and links to request a new one.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await createClient()
  const ready = !error && await hasRecoverySession(supabase.auth)
  return <ResetForm problem={ready ? null : error ? RESET_LINK_INVALID : RESET_NO_SESSION} />
}
