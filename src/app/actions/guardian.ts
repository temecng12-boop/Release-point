'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function recordConsent(playerId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Find the guardian row by the authenticated user's email
  const { data: guardian } = await supabase
    .from('guardians')
    .select('id, full_name')
    .eq('email', user.email!)
    .single()

  if (!guardian) redirect('/auth/login')

  // Link this auth account to the guardian record
  await supabase
    .from('guardians')
    .update({ user_id: user.id })
    .eq('id', guardian.id)

  // Record consent on the player row
  await supabase
    .from('players')
    .update({ consent_given_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('guardian_id', guardian.id)

  // Create a profile for this guardian
  await supabase
    .from('profiles')
    .upsert({ id: user.id, full_name: guardian.full_name ?? user.email!, role: 'guardian' })

  redirect('/guardian')
}
