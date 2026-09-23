import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { signOut } from '@/app/actions/auth'
import UploadButton from './upload-button'
import CreateTeamButton from './create-team-button'
import PlayerRoster from './player-roster'
import CoachOnboardingWizard from './onboarding-wizard'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, role, team_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'guardian') redirect('/guardian')

  const isCoach = (profile?.role ?? user.user_metadata?.role) === 'coach'

  // ── Coach data ──────────────────────────────────────────────────────────────
  const { data: teams } = isCoach
    ? await supabaseAdmin
        .from('teams')
        .select('id, name, age_group')
        .eq('coach_id', user.id)
        .order('created_at')
    : { data: null }

  const { data: players } = isCoach
    ? await supabaseAdmin
        .from('players')
        .select('id, full_name, email, accepted_at, age_group, position, consent_given_at')
        .eq('coach_id', user.id)
        .order('full_name')
    : { data: null }

  const playerIds = players?.map(p => p.id) ?? []

  // Team assignments via junction table
  let playerTeams: { player_id: string; team_id: string }[] = []
  if (isCoach && playerIds.length > 0) {
    const { data: ptData } = await supabaseAdmin
      .from('player_teams')
      .select('player_id, team_id')
      .in('player_id', playerIds)
    playerTeams = (ptData as typeof playerTeams | null) ?? []
  }

  // Clip counts per player
  const { data: allClips } = isCoach && playerIds.length > 0
    ? await supabaseAdmin
        .from('clips')
        .select('id, player_id')
        .in('player_id', playerIds)
    : { data: [] }

  const clipCounts: Record<string, number> = {}
  for (const clip of allClips ?? []) {
    clipCounts[clip.player_id] = (clipCounts[clip.player_id] ?? 0) + 1
  }

  // Recent clips for coach activity feed
  const { data: recentClips } = isCoach && playerIds.length > 0
    ? await supabaseAdmin
        .from('clips')
        .select('id, title, created_at, session_date, player_id')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
        .limit(6)
    : { data: [] }

  // Bullpen sessions per player
  const { data: allSessions } = isCoach && playerIds.length > 0
    ? await supabaseAdmin
        .from('bullpen_sessions')
        .select('id, player_id, session_date, status, pitches, notes, created_at')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Build players with teamIds for the roster component
  const playersWithTeams = (players ?? []).map(p => ({
    ...p,
    teamIds: playerTeams.filter(pt => pt.player_id === p.id).map(pt => pt.team_id),
  }))

  // ── Player data ─────────────────────────────────────────────────────────────
  const { data: playerRow } = !isCoach
    ? await supabaseAdmin
        .from('players')
        .select('id, full_name, position')
        .eq('user_id', user.id)
        .single()
    : { data: null }

  if (!isCoach && playerRow && !playerRow.position) redirect('/onboarding')

  const { data: myClips } = !isCoach && playerRow
    ? await supabaseAdmin
        .from('clips')
        .select('id, title, created_at, session_date, voice_path')
        .eq('player_id', playerRow.id)
        .order('created_at', { ascending: false })
    : { data: null }

  // Fetch pitch metrics for player progression section
  const myClipIds = myClips?.map(c => c.id) ?? []
  const { data: myMetrics } = !isCoach && myClipIds.length > 0
    ? await supabaseAdmin
        .from('pitch_metrics')
        .select('clip_id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, created_at')
        .in('clip_id', myClipIds)
        .order('created_at')
    : { data: [] }

  function fmtDate(sessionDate: string | null, createdAt: string) {
    const iso = sessionDate ?? createdAt
    return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Career stats for player progression section
  const allVelocities = (myMetrics ?? []).filter(m => m.velocity != null).map(m => m.velocity as number)
  const bestVelo = allVelocities.length > 0 ? Math.max(...allVelocities) : null
  const avgVelo = allVelocities.length > 0
    ? Math.round(allVelocities.reduce((a, b) => a + b, 0) / allVelocities.length * 10) / 10
    : null
  const allSpin = (myMetrics ?? []).filter(m => m.spin_rate != null).map(m => m.spin_rate as number)
  const bestSpin = allSpin.length > 0 ? Math.max(...allSpin) : null
  const bestPitch = allVelocities.length > 0
    ? (myMetrics ?? []).find(m => m.velocity === bestVelo) ?? null
    : null
  const myClipTitleMap = Object.fromEntries((myClips ?? []).map(c => [c.id, c.title]))

  const dashNav = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#3D5166] hidden sm:block truncate max-w-[140px]">
          {profile?.full_name ?? user.email}
        </span>
        <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded" style={oswald}>
          {profile?.role ?? user.user_metadata?.role ?? 'coach'}
        </span>
      </div>
      <Link href="/about" className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors hidden sm:block" style={oswald}>
        About
      </Link>
      <Link
        href={isCoach ? '/profile' : '/player-settings'}
        className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors"
        style={oswald}
      >
        {isCoach ? 'Profile' : 'My Profile'}
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader right={dashNav} showSignOut />

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-8">
        {isCoach ? (
          <>
            {/* ── Coach Hero ── */}
            <div
              className="relative rounded-2xl overflow-hidden border border-[#1C3A5C] shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0A1828 0%, #0F1F33 45%, #1C3A5C 100%)' }}
            >
              {/* background grid */}
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }} />
              <div className="absolute top-0 right-0 w-72 h-72 opacity-[0.06] pointer-events-none" style={{
                background: 'radial-gradient(circle, #C8102E 0%, transparent 65%)',
              }} />

              <div className="relative px-7 py-7">
                {/* Top row: identity + stats */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-6">
                  {/* Coach avatar */}
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#C8102E] to-[#9E0E24] flex items-center justify-center text-2xl text-white shrink-0 shadow-lg font-bold" style={oswald}>
                    {(profile?.full_name ?? user.email ?? 'C').split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#C8102E] tracking-[0.3em] mb-0.5" style={oswald}>Head Coach</p>
                    <h1 className="text-2xl text-white truncate leading-tight" style={oswald}>
                      {profile?.full_name ?? user.email?.split('@')[0] ?? 'Coach'}
                    </h1>
                    {profile?.team_name && (
                      <p className="text-sm text-[#7BA7CC] mt-0.5">{profile.team_name}</p>
                    )}
                  </div>
                  <div className="flex gap-3 sm:gap-5 shrink-0">
                    {[
                      { n: players?.length ?? 0, l: 'Players' },
                      { n: teams?.length ?? 0,   l: 'Teams'   },
                      { n: (allClips ?? []).length, l: 'Clips' },
                    ].map(s => (
                      <div key={s.l} className="text-center">
                        <p className="text-2xl text-white leading-none" style={oswald}>{s.n}</p>
                        <p className="text-[11px] text-[#5B7FA0] mt-0.5" style={oswald}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2.5">
                  <CreateTeamButton />
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 text-[12px] border border-[#2A4A6A] hover:border-[#C8102E]/60 text-[#9FB3CC] hover:text-white px-4 py-2 rounded-lg transition-colors"
                    style={oswald}
                  >
                    Edit Profile
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Onboarding wizard (new coaches) ── */}
            {(teams?.length ?? 0) === 0 && (players?.length ?? 0) === 0 && (
              <CoachOnboardingWizard hasTeams={false} hasPlayers={false} />
            )}
            {(teams?.length ?? 0) > 0 && (players?.length ?? 0) === 0 && (
              <CoachOnboardingWizard hasTeams={true} hasPlayers={false} firstTeamId={teams![0].id} />
            )}
            {(teams?.length ?? 0) > 0 && (players?.length ?? 0) > 0 && (allClips?.length ?? 0) === 0 && (
              <CoachOnboardingWizard hasTeams={true} hasPlayers={true} hasClips={false} firstTeamId={teams![0].id} />
            )}

          {/* ── Content Grid ── */}
            <div className="grid md:grid-cols-[1fr_1.6fr] gap-5">

              {/* Left: Teams */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] tracking-[0.2em] text-[#C8102E]" style={oswald}>Your Teams</p>
                  <span className="text-[11px] text-[#5B6B7F]" style={oswald}>{teams?.length ?? 0} total</span>
                </div>

                {!teams || teams.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm px-5 py-10 text-center">
                    <div className="w-12 h-12 rounded-xl bg-[#EEF2F7] flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[#456080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#3D5166] mb-4">No teams yet.</p>
                    <CreateTeamButton />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {teams.map(team => {
                      const count = playerTeams.filter(pt => pt.team_id === team.id).length
                      const clips  = (allClips ?? []).filter(c => players?.some(p => p.id === c.player_id && playerTeams.some(pt => pt.player_id === p.id && pt.team_id === team.id))).length
                      return (
                        <Link
                          key={team.id}
                          href={`/dashboard/team/${team.id}`}
                          className="group flex items-center gap-4 bg-white border border-[#DDE4ED] rounded-xl px-4 py-4 hover:border-[#C8102E]/40 hover:bg-[#FAFBFC] transition-all shadow-sm overflow-hidden relative"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C8102E] rounded-l-xl" />
                          <div className="pl-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-[15px] text-[#0F1F33] truncate font-semibold" style={oswald}>{team.name}</p>
                              {team.age_group && (
                                <span className="text-[11px] border border-[#DDE4ED] text-[#456080] px-2 py-0.5 rounded-full shrink-0" style={oswald}>
                                  {team.age_group}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#5B6B7F]">
                              {count} {count === 1 ? 'player' : 'players'}
                              {clips > 0 ? ` · ${clips} clips` : ''}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-[#DDE4ED] group-hover:text-[#C8102E] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Right: Recent Clips */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] tracking-[0.2em] text-[#C8102E]" style={oswald}>Recent Clips</p>
                  {(recentClips ?? []).length > 0 && (
                    <span className="text-[11px] text-[#5B6B7F]" style={oswald}>{(allClips ?? []).length} total</span>
                  )}
                </div>

                {!recentClips || recentClips.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm px-5 py-10 text-center">
                    <div className="w-12 h-12 rounded-xl bg-[#EEF2F7] flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[#456080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#3D5166]">No clips yet — add players and upload their first session.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
                    {(recentClips ?? []).map((clip, i) => {
                      const player = players?.find(p => p.id === clip.player_id)
                      const sessionLabel = clip.session_date
                        ? new Date(clip.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : new Date(clip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      return (
                        <Link
                          key={clip.id}
                          href={`/clips/${clip.id}`}
                          className="group flex items-center gap-4 px-5 py-3.5 border-b border-[#F0F4F8] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                        >
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0F1F33] to-[#1C3A5C] flex items-center justify-center shrink-0 shadow-sm">
                            <svg className="w-4 h-4 text-[#C8102E]" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-[#0F1F33] truncate font-medium group-hover:text-[#C8102E] transition-colors">{clip.title}</p>
                            <p className="text-[12px] text-[#5B6B7F] mt-0.5">
                              {player?.full_name ?? 'Unknown'} · {sessionLabel}
                            </p>
                          </div>
                          {i === 0 && (
                            <span className="text-[10px] bg-[#C8102E] text-white px-2 py-0.5 rounded shrink-0" style={oswald}>New</span>
                          )}
                          <svg className="w-3.5 h-3.5 text-[#DDE4ED] group-hover:text-[#C8102E] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Players roster ── */}
            {(players?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] tracking-[0.2em] text-[#C8102E]" style={oswald}>
                    All Players ({players?.length ?? 0})
                  </p>
                </div>
                <PlayerRoster
                  players={playersWithTeams}
                  teams={teams ?? []}
                  clipCounts={clipCounts}
                />
              </div>
            )}

          </>
        ) : (
          /* ── Player view ── */
          <div className="space-y-6">
            {/* Welcome hero */}
            <div
              className="relative rounded-2xl overflow-hidden border border-[#1C3A5C] shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0F1F33 0%, #1C3A5C 60%, #0F1F33 100%)' }}
            >
              {/* Background grid */}
              <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }} />
              <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none" style={{
                background: 'radial-gradient(circle, #C8102E 0%, transparent 70%)',
              }} />

              <div className="relative px-7 py-8 flex items-center gap-6">
                {/* Avatar */}
                <div
                  className="w-16 h-16 rounded-xl bg-[#C8102E] flex items-center justify-center text-2xl text-white shrink-0 shadow-lg"
                  style={oswald}
                >
                  {(playerRow?.full_name ?? 'P').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#C8102E] tracking-[0.3em] mb-1" style={oswald}>Welcome Back</p>
                  <h1 className="text-2xl text-white leading-tight truncate" style={oswald}>
                    {playerRow?.full_name ?? 'Pitcher'}
                  </h1>
                  <p className="text-sm text-[#B8D0E8] mt-1">
                    {(myClips?.length ?? 0) === 0
                      ? 'Ready to start your development journey?'
                      : `${myClips!.length} clip${myClips!.length === 1 ? '' : 's'} uploaded · Keep grinding.`}
                  </p>
                </div>

                {playerRow && (
                  <UploadButton playerId={playerRow.id} playerName={playerRow.full_name ?? 'Player'} />
                )}
              </div>

              {/* Stats strip */}
              <div className="border-t border-white/10 grid grid-cols-3 divide-x divide-white/10">
                {[
                  { label: 'Clips', value: myClips?.length ?? 0 },
                  { label: 'Pitches Tracked', value: myMetrics?.length ?? 0 },
                  { label: 'Best Velo', value: bestVelo ? `${bestVelo}` : '—' },
                ].map(s => (
                  <div key={s.label} className="px-5 py-4 text-center">
                    <p className="text-xl text-white" style={oswald}>{s.value}</p>
                    <p className="text-xs text-[#3D5166] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* No clips empty state */}
            {(!myClips || myClips.length === 0) ? (
              <div className="space-y-4">
                <p className="text-xs text-[#3D5166] tracking-[0.3em]" style={oswald}>Get Started</p>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    {
                      icon: (
                        <svg className="w-7 h-7 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      ),
                      title: 'Upload a Clip',
                      desc: 'Film your bullpen or game appearance and upload it. Your coach gets notified instantly.',
                    },
                    {
                      icon: (
                        <svg className="w-7 h-7 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      ),
                      title: 'Track Metrics',
                      desc: 'Your coach uploads Rapsodo data linked to your clips — velocity, spin rate, movement.',
                    },
                    {
                      icon: (
                        <svg className="w-7 h-7 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      ),
                      title: 'Get Feedback',
                      desc: 'Coaches draw directly on your video and leave voice notes. See exactly what to work on.',
                    },
                  ].map(card => (
                    <div key={card.title} className="bg-white border border-[#DDE4ED] rounded-xl p-5 shadow-sm">
                      <div className="w-12 h-12 rounded-xl bg-[#FFF0F2] flex items-center justify-center mb-4">
                        {card.icon}
                      </div>
                      <h3 className="text-sm text-[#0F1F33] mb-2" style={oswald}>{card.title}</h3>
                      <p className="text-sm text-[#3D5166] leading-relaxed">{card.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Upload CTA */}
                {playerRow && (
                  <div className="bg-white border-2 border-dashed border-[#DDE4ED] hover:border-[#C8102E]/50 rounded-xl px-6 py-10 text-center transition-colors">
                    <div className="w-14 h-14 rounded-full bg-[#EEF2F7] flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-[#456080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <h3 className="text-base text-[#0F1F33] mb-2" style={oswald}>Upload Your First Clip</h3>
                    <p className="text-sm text-[#3D5166] mb-5 max-w-xs mx-auto">Film with your phone, upload here, and your coach starts analyzing.</p>
                    <UploadButton playerId={playerRow.id} playerName={playerRow.full_name ?? 'Player'} />
                  </div>
                )}

                {/* Complete profile CTA */}
                <Link
                  href="/player-settings"
                  className="flex items-center gap-4 bg-[#1C3A5C] hover:bg-[#1a3558] text-white rounded-xl px-5 py-4 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium" style={oswald}>Complete Your Profile</p>
                    <p className="text-xs text-[#B8D0E8] mt-0.5">Add height, weight, high school, travel team, and college interests.</p>
                  </div>
                  <svg className="w-5 h-5 text-white/40 group-hover:text-white/80 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ) : (
              /* Has clips */
              <div className="space-y-4">
                {/* Career stats + best pitch */}
                {(myMetrics?.length ?? 0) === 0 && (
                  <div className="bg-white border border-[#DDE4ED] rounded-xl px-5 py-4 shadow-sm text-center">
                    <p className="text-xs text-[#3D5166]">No pitch metrics yet — upload a Rapsodo CSV on any clip to start tracking.</p>
                  </div>
                )}
                {(myMetrics?.length ?? 0) > 0 && (
                  <>
                    <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
                      <div className="h-1 bg-[#C8102E]" />
                      <div className="p-5">
                        <p className="text-[13px] text-[#C8102E] tracking-[0.2em] mb-4" style={oswald}>Career Stats</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            { label: 'Pitches Logged', value: myMetrics!.length },
                            { label: 'Best Velo', value: bestVelo ? `${bestVelo} mph` : '—' },
                            { label: 'Avg Velo', value: avgVelo ? `${avgVelo} mph` : '—' },
                            { label: 'Best Spin', value: bestSpin ? `${bestSpin.toLocaleString()} rpm` : '—' },
                          ].map(stat => (
                            <div key={stat.label} className="text-center">
                              <p className="text-xl text-[#0F1F33]" style={oswald}>{stat.value}</p>
                              <p className="text-xs text-[#3D5166] mt-1">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {bestPitch && (
                      <div
                        className="relative rounded-xl overflow-hidden border border-[#1C3A5C] shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #0F1F33 0%, #1C3A5C 100%)' }}
                      >
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                          backgroundImage: 'radial-gradient(circle at 80% 50%, #C8102E 0%, transparent 60%)',
                        }} />
                        <div className="relative p-5">
                          <p className="text-[13px] text-[#C8102E] tracking-[0.2em] mb-3" style={oswald}>Best Pitch</p>
                          <div className="flex items-end gap-6">
                            <div>
                              <p className="text-4xl text-white leading-none" style={oswald}>
                                {bestPitch.velocity}
                                <span className="text-base text-[#3D5166] ml-1">mph</span>
                              </p>
                              <p className="text-xs text-[#B8D0E8] mt-2">
                                {bestPitch.pitch_type ?? 'Unknown pitch'}
                                {bestPitch.spin_rate ? ` · ${bestPitch.spin_rate.toLocaleString()} rpm` : ''}
                              </p>
                              <p className="text-xs text-[#456080] mt-1 truncate max-w-[200px]">
                                {myClipTitleMap[bestPitch.clip_id] ?? ''}
                              </p>
                            </div>
                            {(bestPitch.horizontal_break != null || bestPitch.vertical_break != null) && (
                              <div className="flex gap-4 ml-auto">
                                {bestPitch.horizontal_break != null && (
                                  <div className="text-center">
                                    <p className="text-lg text-white" style={oswald}>{bestPitch.horizontal_break}</p>
                                    <p className="text-[13px] text-[#3D5166]">HB</p>
                                  </div>
                                )}
                                {bestPitch.vertical_break != null && (
                                  <div className="text-center">
                                    <p className="text-lg text-white" style={oswald}>{bestPitch.vertical_break}</p>
                                    <p className="text-[13px] text-[#3D5166]">VB</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#C8102E] tracking-[0.3em]" style={oswald}>Your Clips ({myClips.length})</p>
                  <Link href="/player-settings" className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors" style={oswald}>
                    Edit Profile →
                  </Link>
                </div>

                <div className="space-y-2">
                  {myClips.map((clip, i) => (
                    <Link
                      key={clip.id}
                      href={`/clips/${clip.id}`}
                      className="flex items-center gap-4 bg-white border border-[#DDE4ED] rounded-xl px-5 py-4 hover:bg-[#F0F4F8] hover:border-[#456080] transition-all shadow-sm group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#EEF2F7] border border-[#DDE4ED] flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-[#C8102E]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#0F1F33] group-hover:text-[#1C3A5C] truncate font-medium">{clip.title}</p>
                        <p className="text-xs text-[#3D5166] mt-0.5">
                          {fmtDate((clip as { session_date?: string | null }).session_date ?? null, clip.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(clip as { voice_path?: string | null }).voice_path && (
                          <span className="flex items-center gap-1 text-[10px] text-[#456080] bg-[#EEF2F7] px-2 py-0.5 rounded-full" title="Coach voice note">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                            </svg>
                            Voice
                          </span>
                        )}
                        {i === 0 && (
                          <span className="text-xs bg-[#C8102E] text-white px-2 py-0.5 rounded" style={oswald}>Latest</span>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-[#3D5166] group-hover:text-[#456080] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
