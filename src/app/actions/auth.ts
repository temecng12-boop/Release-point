'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function signUp(_prevState: { error?: string; message?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

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

export async function signUpPlayer(_prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: 'player', full_name: fullName } },
  })

  if (error) return { error: error.message }

  if (data.user) {
    await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name: fullName || '', role: 'player' })

    // Link to existing player record if a coach already invited this email
    const { data: linked } = await supabaseAdmin
      .from('players')
      .update({ user_id: data.user.id, accepted_at: new Date().toISOString() })
      .eq('email', email)
      .is('user_id', null)
      .select('id')

    // No invite found — create a standalone player row so the user can upload clips
    if (!linked || linked.length === 0) {
      await supabaseAdmin.from('players').insert({
        user_id:     data.user.id,
        full_name:   fullName || '',
        email,
        accepted_at: new Date().toISOString(),
      })
    }
  }

  redirect('/dashboard')
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

  await supabaseAdmin
    .from('players')
    .update({ user_id: user.id, accepted_at: new Date().toISOString() })
    .eq('email', user.email)
    .is('user_id', null)
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  await supabase.rpc('delete_current_user')
  await supabase.auth.signOut()
  redirect('/auth/login')
}
