// Terms of Service acceptance: written once, at signup, with the service role.
//   * public.terms_acceptances (039): append-only history, one row per
//     acceptance (user, version, time).
//   * profiles.tos_accepted_at / tos_version (037): the latest copy.
// Users can't set either (039's profiles_guard_tos and the table's rules).
// Before 039 the history table doesn't exist and only profiles is written;
// before 037 nothing is stored.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError, type DbErrorLike } from './db-errors'

type Db = Pick<SupabaseClient, 'from'>

function missingTable(error: DbErrorLike | null | undefined): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205')
}

function missingTosColumns(error: DbErrorLike | null | undefined): boolean {
  return isMissingColumnError(error, 'tos_accepted_at') || isMissingColumnError(error, 'tos_version')
}

/**
 * Records that `userId` accepted Terms `version` at `acceptedAt`, once: if the
 * profile already has an acceptance, nothing is written. The history row goes
 * in first, so a failure leaves the profile unaccepted and a retry starts
 * over. Returns false only on a real write failure (logged, never shown raw).
 */
export async function recordTermsAcceptance(db: Db, userId: string, acceptedAt: string, version: string): Promise<boolean> {
  if (Number.isNaN(Date.parse(acceptedAt)) || !version) return true
  const { data: profile, error: readError } = await db.from('profiles').select('tos_accepted_at').eq('id', userId).maybeSingle()
  if (missingTosColumns(readError)) return true
  if (readError) {
    console.error('[recordTermsAcceptance] profile read failed', { userId, code: readError.code ?? null, message: readError.message ?? null })
    return false
  }
  if ((profile as { tos_accepted_at?: string | null } | null)?.tos_accepted_at) return true

  const { error: historyError } = await db.from('terms_acceptances').insert({ user_id: userId, tos_version: version, accepted_at: acceptedAt })
  if (historyError && !missingTable(historyError)) {
    console.error('[recordTermsAcceptance] history insert failed', { userId, code: historyError.code ?? null, message: historyError.message ?? null })
    return false
  }
  const { error } = await db.from('profiles')
    .update({ tos_accepted_at: acceptedAt, tos_version: version })
    .eq('id', userId)
    .is('tos_accepted_at', null)
  if (error && !missingTosColumns(error)) {
    console.error('[recordTermsAcceptance] profile update failed', { userId, code: error.code ?? null, message: error.message ?? null })
    return false
  }
  return true
}
