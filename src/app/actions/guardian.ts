'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const CONSENT_FAILED = 'We couldn\'t record your consent. Please try again. If it keeps happening, contact your coach.'

// Returns { error } to the form if any write fails; redirects to /guardian
// only after all of them succeeded. Every write is idempotent (same values on
// a retry), and consent is written last: if an earlier step fails, no consent
// is on file and trying again finishes the job.
export async function recordConsent(playerId: string): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: guardian, error: guardianError } = await supabaseAdmin
    .from('guardians')
    .select('id, full_name')
    .eq('email', user.email!)
    .single()

  // PGRST116: no guardian row for this email (handled as before).
  if (guardianError && guardianError.code !== 'PGRST116') {
    console.error('[recordConsent] guardian lookup failed', { code: guardianError.code, message: guardianError.message })
    return { error: CONSENT_FAILED }
  }
  if (!guardian) redirect('/auth/login')

  const { error: linkError } = await supabaseAdmin
    .from('guardians')
    .update({ user_id: user.id })
    .eq('id', guardian.id)
  if (linkError) {
    console.error('[recordConsent] guardian link failed', { code: linkError.code, message: linkError.message })
    return { error: CONSENT_FAILED }
  }

  // Insert-only: an existing profile's role and name are never overwritten.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      { id: user.id, full_name: guardian.full_name ?? user.email!, role: 'guardian' },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (profileError) {
    console.error('[recordConsent] guardian profile failed', { code: profileError.code, message: profileError.message })
    return { error: CONSENT_FAILED }
  }

  // Signup gives every account a 'player' profile, so a parent who signed up
  // from the consent link is 'player'. Migration 029's function turns that into
  // 'guardian' only if the role is 'player' and the account has no players row,
  // clips or other data; anything else keeps its role. One conditional UPDATE
  // in the database, called with the service role only.
  const { error: roleError } = await supabaseAdmin
    .rpc('promote_empty_player_to_guardian', { p_user_id: user.id })
  if (roleError) {
    console.error('[recordConsent] guardian role check failed', { code: roleError.code, message: roleError.message })
    return { error: CONSENT_FAILED }
  }

  const { data: consented, error: consentError } = await supabaseAdmin
    .from('players')
    .update({ consent_given_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('guardian_id', guardian.id)
    .select('id')
  if (consentError) {
    console.error('[recordConsent] consent write failed', { code: consentError.code, message: consentError.message })
    return { error: CONSENT_FAILED }
  }
  if (!consented || consented.length === 0) {
    // Not this guardian's player (or it no longer exists): nothing was recorded.
    console.error('[recordConsent] consent matched no player', { playerId, guardianId: guardian.id })
    return { error: 'We couldn\'t record consent for this player. Ask your coach to check that your email is listed as the guardian.' }
  }

  redirect('/guardian')
}
