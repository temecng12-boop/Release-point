'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const AGE_GROUPS = ['12U', '13U', '14U', '15U', '16U', '17U', '18U']

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

  const { error } = await supabase
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

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('coach_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}
