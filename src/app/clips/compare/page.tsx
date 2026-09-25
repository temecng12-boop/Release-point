import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'
import ComparePlayer, { ClipData } from './compare-player'
import ClipPicker from './clip-picker'

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string; c?: string; d?: string }> }) {
  const { a, b, c, d } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  if (!a) redirect('/dashboard')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? user.user_metadata?.role ?? 'player') as 'coach' | 'player'

  async function loadClip(clipId: string): Promise<ClipData | null> {
    const { data: clip } = await supabaseAdmin
      .from('clips')
      .select('id, title, storage_path, created_at, session_date, player_id')
      .eq('id', clipId)
      .single()

    if (!clip) return null

    const { data: playerRow } = await supabaseAdmin
      .from('players')
      .select('full_name, coach_id, user_id')
      .eq('id', clip.player_id)
      .single()

    const isCoachOfPlayer = role === 'coach' && playerRow?.coach_id === user!.id
    const isPlayerOwner   = role === 'player' && playerRow?.user_id === user!.id
    if (!isCoachOfPlayer && !isPlayerOwner) return null

    const { data: signed } = await supabaseAdmin.storage
      .from('clips')
      .createSignedUrl(clip.storage_path, 3600)

    if (!signed?.signedUrl) return null

    const sessionDate = clip.session_date
      ? new Date(clip.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(clip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    return {
      id: clip.id,
      title: clip.title,
      videoUrl: signed.signedUrl,
      playerName: playerRow?.full_name ?? 'Player',
      sessionDate,
    }
  }

  function youtubeClip(ytId: string): ClipData {
    return { id: '', title: 'YouTube Video', videoUrl: '', playerName: 'YouTube', sessionDate: '', youtubeId: ytId }
  }

  async function resolveSlot(param: string | undefined): Promise<ClipData | null | undefined> {
    if (!param) return undefined
    if (param.startsWith('yt:')) return youtubeClip(param.slice(3))
    return loadClip(param)
  }

  const clipA = await resolveSlot(a)
  // clipA must resolve to a real clip (not undefined, not null)
  if (!clipA) notFound()

  // Picker mode — only clipA loaded (b missing)
  if (!b) {
    // Load all accessible clips except the source
    let allClips: { id: string; title: string; created_at: string; session_date: string | null; player_id: string }[] = []

    if (role === 'coach') {
      const { data: players } = await supabaseAdmin
        .from('players')
        .select('id')
        .eq('coach_id', user.id)
      const playerIds = (players ?? []).map(p => p.id)
      if (playerIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('clips')
          .select('id, title, created_at, session_date, player_id')
          .in('player_id', playerIds)
          .neq('id', a)
          .order('created_at', { ascending: false })
          .limit(50)
        allClips = data ?? []
      }
    } else {
      const { data: playerRow } = await supabaseAdmin
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (playerRow) {
        const { data } = await supabaseAdmin
          .from('clips')
          .select('id, title, created_at, session_date, player_id')
          .eq('player_id', playerRow.id)
          .neq('id', a)
          .order('created_at', { ascending: false })
          .limit(50)
        allClips = data ?? []
      }
    }

    // Get player names for all clips
    const playerIds = [...new Set(allClips.map(c => c.player_id))]
    const playerNames: Record<string, string> = {}
    if (playerIds.length > 0) {
      const { data: pRows } = await supabaseAdmin
        .from('players')
        .select('id, full_name')
        .in('id', playerIds)
      for (const p of pRows ?? []) playerNames[p.id] = p.full_name
    }

    const pickerClips = allClips.map(c => ({
      id: c.id,
      title: c.title,
      playerName: playerNames[c.player_id] ?? 'Player',
      sessionDate: c.session_date
        ? new Date(c.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }))

    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <AppHeader
          breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Compare' }]}
          showSignOut
        />
        <main className="max-w-2xl mx-auto px-4 md:px-6 py-8">
          <ClipPicker
            sourceClipId={a}
            sourceClipTitle={clipA.title}
            clips={pickerClips}
          />
        </main>
        <SiteFooter variant="app" />
      </div>
    )
  }

  // Resolve b, c, d slots in parallel
  const [clipB, clipC, clipD] = await Promise.all([
    resolveSlot(b),
    resolveSlot(c),
    resolveSlot(d),
  ])

  if (!clipB) notFound()

  // Build clips array — only include slots that resolved successfully
  const clips: ClipData[] = [clipA, clipB]
  if (clipC) clips.push(clipC)
  if (clipD) clips.push(clipD)

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[
          { href: '/dashboard', label: 'Dashboard' },
          { label: 'Compare' },
        ]}
        showSignOut
      />
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <ComparePlayer clips={clips} />
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
