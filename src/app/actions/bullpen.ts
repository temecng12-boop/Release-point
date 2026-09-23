'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type PitchBlock = {
  pitch_type: string
  target: number
  thrown: number
  focus: string
}

async function assertCoachOfPlayer(userId: string, playerId: string) {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('coach_id')
    .eq('id', playerId)
    .single()
  return player?.coach_id === userId
}

export async function createBullpenSession(data: {
  player_id: string
  session_date: string | null
  pitches: PitchBlock[]
  notes: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertCoachOfPlayer(user.id, data.player_id))) return { error: 'Not authorized' }

  const { data: session, error } = await supabaseAdmin
    .from('bullpen_sessions')
    .insert({
      player_id:    data.player_id,
      coach_id:     user.id,
      session_date: data.session_date || null,
      pitches:      data.pitches,
      notes:        data.notes || null,
      status:       'planned',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { id: session.id }
}

export async function updateBullpenSession(sessionId: string, updates: {
  pitches?: PitchBlock[]
  notes?: string
  status?: 'planned' | 'complete'
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: session } = await supabaseAdmin
    .from('bullpen_sessions')
    .select('coach_id')
    .eq('id', sessionId)
    .single()
  if (session?.coach_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin
    .from('bullpen_sessions')
    .update(updates)
    .eq('id', sessionId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteBullpenSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: session } = await supabaseAdmin
    .from('bullpen_sessions')
    .select('coach_id')
    .eq('id', sessionId)
    .single()
  if (session?.coach_id !== user.id) return { error: 'Not authorized' }

  const { error } = await supabaseAdmin
    .from('bullpen_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}
