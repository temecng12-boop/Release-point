'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

function toTitleCase(s: string) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

export async function signUp(_prevState: { error?: string; message?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  if (!formData.get('tos')) return { error: 'You must accept the Terms of Service to continue.' }

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: 'coach', full_name: fullName } },
  })

  if (error) return { error: error.message }

  if (data.user) {
    await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name: fullName || '', role: 'coach' })
  }

  redirect('/dashboard')
}

export async function signUpPlayer(
  _prevState: { error?: string; sent?: boolean; email?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  let fullName = formData.get('full_name') as string
  if (fullName) fullName = toTitleCase(fullName)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { role: 'player', full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`,
    },
  })

  if (error) return { error: error.message }

  return { sent: true, email }
}

export async function signIn(_prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function linkPlayerRow() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return

  const role     = (user.user_metadata?.role ?? 'player') as string
  const fullName = (user.user_metadata?.full_name ?? '') as string
  const now      = new Date().toISOString()

  // Ensure profile row exists
  await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName, role }, { onConflict: 'id', ignoreDuplicates: true })

  if (role !== 'player') return

  // Link to an existing invited player record
  const { data: linked } = await supabaseAdmin
    .from('players')
    .update({ user_id: user.id, accepted_at: now, consent_given_at: now })
    .eq('email', user.email)
    .is('user_id', null)
    .select('id')

  // No invite — create a standalone player row
  if (!linked || linked.length === 0) {
    const { data: existing } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      await supabaseAdmin.from('players').insert({
        user_id:          user.id,
        full_name:        fullName,
        email:            user.email,
        accepted_at:      now,
        consent_given_at: now,
      })
    }
  }
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  await supabase.rpc('delete_current_user')
  await supabase.auth.signOut()
  redirect('/auth/login')
}
