'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']

export async function createTeam(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  const ageGroup = (formData.get('age_group') as string)?.trim()

  if (!name) return { error: 'Team name is required' }
  if (ageGroup && !AGE_GROUPS.includes(ageGroup)) return { error: 'Invalid age group' }

  const { error } = await supabaseAdmin
    .from('teams')
    .insert({ coach_id: user.id, name, age_group: ageGroup || null })

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteTeam(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabaseAdmin
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('coach_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}
