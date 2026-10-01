'use server'

import { createClient } from '@/lib/supabase/server'
import { passwordProblem } from '@/lib/password-rule'
import { hasRecoverySession, RESET_LINK_INVALID } from '@/lib/password-reset'

export type ResetPasswordState = { error?: string; expired?: boolean; success?: boolean } | undefined

/**
 * Sets a new password from a reset link. Runs on the server so the password
 * rule (#34) can't be skipped by the browser, and only with a recovery
 * session (from the reset link, read from the session cookies). Success is
 * returned only after Supabase confirms the update.
 */
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = (formData.get('password') as string | null) ?? ''
  const confirm  = (formData.get('confirm_password') as string | null) ?? ''

  const problem = passwordProblem(password)
  if (problem) return { error: problem }
  if (password !== confirm) return { error: 'The two passwords don\'t match.' }

  const supabase = await createClient()
  if (!(await hasRecoverySession(supabase.auth))) return { error: RESET_LINK_INVALID, expired: true }

  let result: { error: { message: string; code?: string } | null }
  try {
    result = await supabase.auth.updateUser({ password })
  } catch {
    return { error: 'Couldn\'t reach the server. Your password was not changed. Try again.' }
  }
  if (result.error) {
    if (result.error.code === 'same_password') return { error: 'Choose a password you haven\'t used for this account.' }
    return { error: `Your password was not changed: ${result.error.message}` }
  }
  return { success: true }
}
