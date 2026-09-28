import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const clipId = request.nextUrl.searchParams.get('id')
  if (!clipId) return NextResponse.json({ error: 'no id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return NextResponse.json({ error: 'coaches only' }, { status: 403 })

  // Test 1: basic select (no lesson_path)
  const { data: clip1, error: e1 } = await supabaseAdmin
    .from('clips')
    .select('id, title, player_id, storage_path, created_at')
    .eq('id', clipId)
    .single()

  // Test 2: full select matching page.tsx (includes lesson_path)
  const { data: clip2, error: e2 } = await supabaseAdmin
    .from('clips')
    .select('id, title, storage_path, created_at, session_date, player_id, notes, voice_path, lesson_path')
    .eq('id', clipId)
    .single()

  // Test 3: phase_checklist
  const { data: clip3, error: e3 } = await supabaseAdmin
    .from('clips')
    .select('phase_checklist')
    .eq('id', clipId)
    .single()

  return NextResponse.json({
    clipId,
    test1_basic: { found: !!clip1, error: e1 ? { msg: e1.message, code: e1.code } : null },
    test2_full:  { found: !!clip2, error: e2 ? { msg: e2.message, code: e2.code } : null },
    test3_phase: { found: !!clip3, error: e3 ? { msg: e3.message, code: e3.code } : null },
  })
}
