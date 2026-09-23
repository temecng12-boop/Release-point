import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import ProfileTabs from './profile-tabs'
import UploadButton from '@/app/dashboard/upload-button'
import AppHeader from '@/components/app-header'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') redirect('/dashboard')

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('id, full_name, email, accepted_at, age_group, position, coach_id, consent_given_at')
    .eq('id', id)
    .single()

  // Allow access if this player was invited by the coach OR is a self-signup player linked by email
  if (!player) notFound()
  if (player.coach_id !== null && player.coach_id !== user.id) notFound()

  // Fetch all clips for this player
  const { data: clips } = await supabaseAdmin
    .from('clips')
    .select('id, title, created_at, session_date, notes')
    .eq('player_id', id)
    .order('created_at', { ascending: false })

  const clipIds = (clips ?? []).map(c => c.id)

  // Fetch all pitch metrics across all clips
  const { data: rawMetrics } = clipIds.length > 0
    ? await supabaseAdmin
        .from('pitch_metrics')
        .select('clip_id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')
        .in('clip_id', clipIds)
    : { data: [] }

  // Fetch all timestamp notes across all clips
  const { data: rawTsNotes } = clipIds.length > 0
    ? await supabaseAdmin
        .from('timestamp_notes')
        .select('clip_id, time_seconds, body')
        .in('clip_id', clipIds)
        .order('created_at')
    : { data: [] }

  // Build a lookup for clip info
  const clipMap = Object.fromEntries(
    (clips ?? []).map(c => [c.id, { title: c.title, date: fmtDate(c.session_date ? c.session_date + 'T12:00:00' : c.created_at) }])
  )

  // Enrich metrics with clip context
  const metrics = (rawMetrics ?? []).map(m => ({
    clip_id: m.clip_id,
    clip_title: clipMap[m.clip_id]?.title ?? 'Unknown clip',
    clip_date: clipMap[m.clip_id]?.date ?? '',
    pitch_type: m.pitch_type,
    velocity: m.velocity,
    spin_rate: m.spin_rate,
    spin_axis: m.spin_axis,
    horizontal_break: m.horizontal_break,
    vertical_break: m.vertical_break,
  }))

  // Enrich timestamp notes + text notes into a combined coaching notes list
  const notes = [
    ...(rawTsNotes ?? []).map(n => ({
      clip_id: n.clip_id,
      clip_title: clipMap[n.clip_id]?.title ?? 'Unknown clip',
      clip_date: clipMap[n.clip_id]?.date ?? '',
      body: n.body,
      time_seconds: n.time_seconds as number | null,
    })),
    ...(clips ?? [])
      .filter(c => c.notes && c.notes.trim())
      .map(c => ({
        clip_id: c.id,
        clip_title: c.title,
        clip_date: clipMap[c.id]?.date ?? '',
        body: c.notes!,
        time_seconds: null,
      })),
  ]

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: player.full_name }]}
        showSignOut
      />

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        {/* Player hero card */}
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-6">
            <div className="flex items-center gap-5">
              <div
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1C3A5C] to-[#456080] border border-[#DDE4ED] flex items-center justify-center text-xl text-white shrink-0"
                style={oswald}
              >
                {initials(player.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl text-[#0F1F33] truncate" style={oswald}>{player.full_name}</h1>
                <p className="text-xs text-[#3D5166] mt-0.5 truncate">{player.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {player.age_group && (
                    <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full">{player.age_group}</span>
                  )}
                  {player.position && (
                    <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full capitalize">{player.position}</span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded tracking-wide ${player.accepted_at ? 'bg-green-100 text-green-700' : 'bg-[#EEF2F7] text-[#456080]'}`}
                    style={oswald}
                  >
                    {player.accepted_at ? 'Active' : 'Not yet signed up'}
                  </span>
                </div>
              </div>
              {/* Upload button for coach */}
              <UploadButton playerId={player.id} playerName={player.full_name} consentGiven={!!player.consent_given_at} />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-[#DDE4ED]">
              <div>
                <p className="text-2xl text-[#0F1F33]" style={oswald}>{clips?.length ?? 0}</p>
                <p className="text-xs text-[#3D5166] mt-0.5">Clips</p>
              </div>
              <div>
                <p className="text-2xl text-[#0F1F33]" style={oswald}>{metrics.length}</p>
                <p className="text-xs text-[#3D5166] mt-0.5">Pitches tracked</p>
              </div>
              {player.accepted_at && (
                <div>
                  <p className="text-sm text-[#0F1F33] mt-0.5" style={oswald}>{fmtDate(player.accepted_at)}</p>
                  <p className="text-xs text-[#3D5166] mt-0.5">Joined</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProfileTabs
          playerId={player.id}
          playerName={player.full_name}
          playerAgeGroup={player.age_group}
          playerPosition={player.position}
          clips={clips ?? []}
          metrics={metrics}
          notes={notes}
        />
      </main>
    </div>
  )
}
