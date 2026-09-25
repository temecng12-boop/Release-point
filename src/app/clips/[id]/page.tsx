import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import VideoPlayer from '@/components/video-player'
import ClipTabs, { type Metric } from './clip-tabs'
import SaveBanner from './save-banner'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

export default async function ClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('id, title, storage_path, created_at, session_date, player_id, notes, voice_path')
    .eq('id', id)
    .single()

  if (clipError) console.error('[ClipPage] DB error fetching clip', id, JSON.stringify(clipError))
  if (!clip) notFound()

  // Fetch phase_checklist separately — returns null if column not yet migrated (error code 42703)
  let phaseChecklist: { name: string; rating: 'good' | 'needs_work' | 'critical' | null; note: string }[] | null = null
  const { data: checklistData, error: checklistError } = await supabaseAdmin
    .from('clips')
    .select('phase_checklist')
    .eq('id', id)
    .single()
  if (!checklistError) {
    phaseChecklist = (checklistData as { phase_checklist: typeof phaseChecklist } | null)?.phase_checklist ?? null
  }

  let signedUrl: string = ''
  if (clip.storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from('clips')
      .createSignedUrl(clip.storage_path, 3600)
    signedUrl = signed?.signedUrl ?? ''
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? user.user_metadata?.role ?? 'player') as 'coach' | 'player'

  const { data: playerRow } = await supabaseAdmin
    .from('players')
    .select('full_name, age_group, position, coach_id, user_id')
    .eq('id', clip.player_id)
    .single()

  const { data: rawAnnotations } = await supabaseAdmin
    .from('annotations')
    .select('id, type, color, points, start_pt, end_pt, origin_time')
    .eq('clip_id', id)
    .order('created_at')

  // Try with drawing_data; fall back to without it if the column doesn't exist yet
  let tsNotes: { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }[] | null = null
  {
    const { data, error } = await supabaseAdmin
      .from('timestamp_notes')
      .select('id, time_seconds, body, drawing_data')
      .eq('clip_id', id)
      .order('time_seconds')
    if (!error) {
      tsNotes = data
    } else {
      const { data: fallback } = await supabaseAdmin
        .from('timestamp_notes')
        .select('id, time_seconds, body')
        .eq('clip_id', id)
        .order('time_seconds')
      tsNotes = fallback
    }
  }

  // Try fetching with new columns; fall back to core columns if they don't exist yet
  let rawMetrics: Record<string, unknown>[] | null = null
  {
    const { data, error } = await supabaseAdmin
      .from('pitch_metrics')
      .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, extension, vaa')
      .eq('clip_id', id)
      .order('created_at')
    if (!error) {
      rawMetrics = data as Record<string, unknown>[]
    } else {
      const { data: fallback } = await supabaseAdmin
        .from('pitch_metrics')
        .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
        .eq('clip_id', id)
        .order('created_at')
      rawMetrics = fallback as Record<string, unknown>[]
    }
  }

  let voiceUrl: string | null = null
  if (clip.voice_path) {
    const { data: signedVoice } = await supabaseAdmin.storage
      .from('clips')
      .createSignedUrl(clip.voice_path, 3600)
    voiceUrl = signedVoice?.signedUrl ?? null
  }

  let lessonPath: string | null = null
  {
    const { data: lpData } = await supabaseAdmin
      .from('clips')
      .select('lesson_path')
      .eq('id', id)
      .single()
    lessonPath = (lpData as { lesson_path?: string | null } | null)?.lesson_path ?? null
  }

  let initialReframe: { zoom: number; panX: number; panY: number } | null = null
  {
    const { data: rfData } = await supabaseAdmin
      .from('clips')
      .select('reframe')
      .eq('id', id)
      .single()
    initialReframe = (rfData as { reframe?: { zoom: number; panX: number; panY: number } | null } | null)?.reframe ?? null
  }

  let lessonUrl: string | null = null
  if (lessonPath) {
    const { data: signedLesson } = await supabaseAdmin.storage
      .from('clips')
      .createSignedUrl(lessonPath, 3600)
    lessonUrl = signedLesson?.signedUrl ?? null
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: clip.title }]}
        showSignOut
      />

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 pb-24">
        {/* Compare button */}
        <div className="flex justify-end mb-3">
          <Link
            href={`/clips/compare?a=${id}`}
            className="text-xs text-[#3D5166] hover:text-[#1C3A5C] border border-[#DDE4ED] hover:border-[#456080] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Compare
          </Link>
        </div>

        <VideoPlayer
          src={signedUrl}
          clipId={id}
          playerId={clip.player_id}
          role={role}
          initialAnnotations={rawAnnotations ?? []}
          initialLessonUrl={lessonUrl}
          initialReframe={initialReframe}
        />

        <div className="mt-4">
          <ClipTabs
            clipId={id}
            playerId={clip.player_id}
            role={role}
            initialNotes={clip.notes ?? null}
            initialVoiceUrl={voiceUrl}
            initialTsNotes={tsNotes ?? []}
            initialMetrics={(rawMetrics ?? []) as Metric[]}
            initialChecklist={phaseChecklist}
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
