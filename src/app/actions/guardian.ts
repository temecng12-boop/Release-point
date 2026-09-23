'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function recordConsent(playerId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: guardian } = await supabaseAdmin
    .from('guardians')
    .select('id, full_name')
    .eq('email', user.email!)
    .single()

  if (!guardian) redirect('/auth/login')

  await supabaseAdmin
    .from('guardians')
    .update({ user_id: user.id })
    .eq('id', guardian.id)

  await supabaseAdmin
    .from('players')
    .update({ consent_given_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('guardian_id', guardian.id)

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, full_name: guardian.full_name ?? user.email!, role: 'guardian' })

  redirect('/guardian')
}
