import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import VideoPlayer from '@/components/video-player'
import ClipTabs from './clip-tabs'
import SaveBanner from './save-banner'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

export default async function ClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('id, title, storage_path, created_at, session_date, player_id, notes, voice_path')
    .eq('id', id)
    .single()

  if (!clip) notFound()

  const { data: signed } = await supabaseAdmin.storage
    .from('clips')
    .createSignedUrl(clip.storage_path, 3600)

  if (!signed?.signedUrl) notFound()

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? user.user_metadata?.role ?? 'player') as 'coach' | 'player'

  const { data: rawAnnotations } = await supabaseAdmin
    .from('annotations')
    .select('id, type, color, points, start_pt, end_pt, origin_time')
    .eq('clip_id', id)
    .order('created_at')

  const { data: tsNotes } = await supabaseAdmin
    .from('timestamp_notes')
    .select('id, time_seconds, body')
    .eq('clip_id', id)
    .order('time_seconds')

  const { data: playerRow } = await supabaseAdmin
    .from('players')
    .select('full_name, age_group, position')
    .eq('id', clip.player_id)
    .single()

  const { data: rawMetrics } = await supabaseAdmin
    .from('pitch_metrics')
    .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
    .eq('clip_id', id)
    .order('created_at')

  let voiceUrl: string | null = null
  if (clip.voice_path) {
    const { data: signedVoice } = await supabaseAdmin.storage
      .from('clips')
      .createSignedUrl(clip.voice_path, 3600)
    voiceUrl = signedVoice?.signedUrl ?? null
  }

  const sessionLabel = clip.session_date
    ? new Date(clip.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: clip.title }]}
        showSignOut
      />

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5">
        <VideoPlayer
          src={signed.signedUrl}
          clipId={id}
          role={role}
          initialAnnotations={rawAnnotations ?? []}
        />

        <div className="mt-4">
          <ClipTabs
            clipId={id}
            playerId={clip.player_id}
            role={role}
            initialNotes={clip.notes ?? null}
            initialVoiceUrl={voiceUrl}
            initialTsNotes={tsNotes ?? []}
            initialMetrics={rawMetrics ?? []}
            playerName={playerRow?.full_name ?? 'Player'}
            playerAgeGroup={playerRow?.age_group ?? null}
            playerPosition={playerRow?.position ?? null}
          />
        </div>
      </main>

      <SaveBanner role={role} />
      <SiteFooter variant="app" />
    </div>
  )
}
