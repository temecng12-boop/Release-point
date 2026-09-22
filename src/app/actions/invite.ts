'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function invitePlayer(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') return { error: 'Only coaches can invite players' }

  const playerName  = (formData.get('full_name') as string).trim()
  const playerEmail = (formData.get('player_email') as string).trim().toLowerCase()
  const teamIds = formData.getAll('team_ids') as string[]

  if (!playerEmail) return { error: 'Player email is required' }

  // Create player row
  const { data: player, error: playerError } = await supabaseAdmin
    .from('players')
    .insert({
      coach_id:  user.id,
      full_name: playerName,
      email:     playerEmail,
    })
    .select('id')
    .single()

  if (playerError) return { error: playerError.message }

  // Assign teams via junction table
  if (teamIds.length > 0) {
    await supabaseAdmin.from('player_teams').insert(
      teamIds.map((tid) => ({ player_id: player.id, team_id: tid }))
    )
  }

  revalidatePath('/', 'layout')
  return {
    success: `${playerName} added! Have them go to ${process.env.NEXT_PUBLIC_SITE_URL ?? 'your app'} and sign up as a Player using ${playerEmail}.`,
  }
}
