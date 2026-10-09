import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { isFrozenUnder13, type PlayerConsentFields } from '@/lib/consent'
import AgeStopNotice from '@/components/age-stop-notice'
import AccountLoadError from '@/components/account-load-error'
import { dashboardRoute } from '@/lib/age-gate-routing'
import UploadButton from './upload-button'
import CreateTeamButton from './create-team-button'
import CoachOnboardingWizard from './onboarding-wizard'
import ActivityFeed from './activity-feed'
import { loadActivityClips } from '@/lib/activity-feed'
import AppHeader from '@/components/app-header'
import MobileNav from '@/components/mobile-nav'
import SiteFooter from '@/components/SiteFooter'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const profileRead = await supabaseAdmin
    .from('profiles')
    .select('full_name, role, team_name, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  const profile = profileRead.data

  // A failed or missing profile read: say so (Try again / Sign out). Never
  // guess a role and render an empty dashboard that looks fine.
  if (dashboardRoute(profileRead, null) === 'error') {
    console.error('[dashboard] profile read failed', { userId: user.id, missing: !profileRead.error })
    return <AccountLoadError retryHref="/dashboard" />
  }
  if (profile?.role === 'guardian') redirect('/guardian')

  // Role comes from profiles only; user_metadata is set by the client at signup.
  const isCoach = profile?.role === 'coach'

  // ── Coach data ──────────────────────────────────────────────────────────────
  // Fetch all teams where this user is a coach (organizer OR assistant)
  const { data: teamCoachRows } = isCoach
    ? await supabaseAdmin
        .from('team_coaches')
        .select('team_id, role, teams(id, name, age_group, coach_id)')
        .eq('coach_id', user.id)
    : { data: null }

  const teams = (teamCoachRows ?? []).map(r => {
    const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
    return { id: t?.id as string, name: t?.name as string, age_group: t?.age_group as string | null, myRole: r.role }
  }).filter(t => t.id)

  const teamIds = teams.map(t => t.id)

  // Player links across all teams
  const { data: allPlayerLinks } = isCoach && teamIds.length > 0
    ? await supabaseAdmin
        .from('player_teams')
        .select('player_id, team_id')
        .in('team_id', teamIds)
    : { data: [] }

  const allTeamPlayerIds = [...new Set((allPlayerLinks ?? []).map(l => l.player_id))]

  // Also include players directly assigned to this coach
  const { data: directPlayers } = isCoach
    ? await supabaseAdmin
        .from('players')
        .select('id')
        .eq('coach_id', user.id)
    : { data: null }

  const directPlayerIds = (directPlayers ?? []).map(p => p.id)
  const allPlayerIds = [...new Set([...allTeamPlayerIds, ...directPlayerIds])]

  // All clips the caller may see (roster + teams). Never another coach's.
  const allClips = isCoach ? await loadActivityClips(user.id) : []

  // Per-team stats computed once per request (server snapshot, not a render tick).
  // eslint-disable-next-line react-hooks/purity -- request-time window for "active in last 30 days"
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const teamStats = teams.map(team => {
    const memberIds = (allPlayerLinks ?? [])
      .filter(l => l.team_id === team.id)
      .map(l => l.player_id)
    const teamClips = (allClips ?? []).filter(c => memberIds.includes(c.player_id))
    const sortedClips = [...teamClips].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastClip = sortedClips[0] ?? null
    const activePlayers = new Set(
      teamClips.filter(c => new Date(c.created_at) > thirtyDaysAgo).map(c => c.player_id)
    ).size
    return {
      ...team,
      playerCount: memberIds.length,
      clipCount: teamClips.length,
      lastActivity: lastClip
        ? (lastClip.session_date ?? lastClip.created_at)
        : null,
      activePlayerCount: activePlayers,
    }
  })

  // Player name lookup for all clips in the activity feed
  const { data: allPlayers } = allPlayerIds.length > 0
    ? await supabaseAdmin
        .from('players')
        .select('id, full_name')
        .in('id', allPlayerIds)
    : { data: [] }
  const allPlayerNameMap = Object.fromEntries((allPlayers ?? []).map(p => [p.id, p.full_name]))

  // ── Player data ─────────────────────────────────────────────────────────────
  const { data: playerRow, error: playerReadError } = !isCoach
    ? await selectPlayersWithConsent<{ id: string; full_name: string | null; position: string | null } & PlayerConsentFields>(
        'id, full_name, position',
        (cols) => supabaseAdmin.from('players').select(cols).eq('user_id', user.id).maybeSingle(),
      )
    : { data: null, error: null }

  // A player whose age isn't confirmed yet (coach-invited, Google/Apple, no
  // players row yet) answers the one screen first, once.
  // Only on a confirmed state (both rows read fine); see src/lib/age-gate-routing.ts.
  if (dashboardRoute(profileRead, isCoach ? null : { data: playerRow, error: playerReadError }) === 'age') redirect('/onboarding/age')
  // Under 13 is a hard stop for now: the account shows only the stop message.
  const frozen = !isCoach && isFrozenUnder13(playerRow)
  // Position chips are optional: an empty selection is valid, so the dashboard
  // does not send the player back to the picker.

  const { data: myClips } = !isCoach && playerRow
    ? await supabaseAdmin
        .from('clips')
        .select('id, title, created_at, session_date')
        .eq('player_id', playerRow.id)
        .order('created_at', { ascending: false })
    : { data: null }

  const myClipIds = myClips?.map(c => c.id) ?? []
  const { data: myMetrics } = !isCoach && myClipIds.length > 0
    ? await supabaseAdmin
        .from('pitch_metrics')
        .select('clip_id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break, created_at')
        .in('clip_id', myClipIds)
        .order('created_at')
    : { data: [] }

  function fmtClipDate(sessionDate: string | null, createdAt: string) {
    const iso = sessionDate ?? createdAt
    return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

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

  // Desktop-only inline nav (hidden on mobile — mobile uses the drawer)
  const dashNav = (
    <div className="hidden sm:flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 hidden md:block truncate max-w-[140px]">
          {profile?.full_name ?? user.email}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ ...os, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
        >
          {profile?.role ?? 'player'}
        </span>
      </div>
      {profile?.is_platform_admin && (
        <Link href="/admin/waitlist" className="text-xs text-[#C8102E] hover:text-[#9E0E24] transition-colors font-semibold" style={os}>
          Admin
        </Link>
      )}
      <Link href="/about" className="text-xs text-slate-400 hover:text-slate-700 transition-colors" style={os}>
        About RP
      </Link>
      <Link
        href={isCoach ? '/profile' : '/player-settings'}
        className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
        style={os}
      >
        {isCoach ? 'Profile' : 'My Profile'}
      </Link>
    </div>
  )

  const mobileNavItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      href: '/clips/compare',
      label: 'Compare Clips',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
      ),
    },
    {
      href: isCoach ? '/profile' : '/player-settings',
      label: isCoach ? 'Profile' : 'My Profile',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      href: '/about',
      label: 'About Release Point',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
      ),
    },
    ...(profile?.is_platform_admin ? [{
      href: '/admin/waitlist',
      label: 'Admin',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        right={dashNav}
        mobileNav={
          <MobileNav
            items={mobileNavItems}
            userName={profile?.full_name ?? user.email?.split('@')[0]}
            userRole={profile?.role ?? 'player'}
          />
        }
        showSignOut
      />

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-6">
        {isCoach ? (
          <>
            {/* ── Compact coach hero ── */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div className="h-px bg-[#E8102A]" />
              <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg text-white shrink-0 font-bold"
                    style={{ ...os, background: 'linear-gradient(135deg, #E8102A, #A50D1E)' }}
                  >
                    {(profile?.full_name ?? user.email ?? 'C').split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#E8102A] tracking-[0.3em]" style={os}>Head Coach</p>
                    <h1 className="text-lg text-slate-950 truncate leading-tight tracking-tight" style={os}>
                      {profile?.full_name ?? user.email?.split('@')[0] ?? 'Coach'}
                    </h1>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  {[
                    { n: allPlayerIds.length, l: 'Players' },
                    { n: teams.length,         l: 'Teams'   },
                    { n: (allClips ?? []).length, l: 'Clips' },
                  ].map(s => (
                    <div key={s.l} className="text-center">
                      <p className="text-xl text-slate-950 leading-none tracking-tight" style={os}>{s.n}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5" style={os}>{s.l}</p>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <CreateTeamButton />
                    <Link
                      href="/clips/compare"
                      className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg transition-colors text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      style={{ ...os, border: '1px solid #e2e8f0' }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                      </svg>
                      Compare
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Onboarding wizard (shows until all 3 steps done + dismissed) ── */}
            <CoachOnboardingWizard
              hasTeams={teams.length > 0}
              hasPlayers={allPlayerIds.length > 0}
              hasClips={(allClips ?? []).length > 0}
              firstTeamId={teams[0]?.id}
            />

            {/* ── Teams grid ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] tracking-[0.25em] text-[#E8102A]" style={os}>Your Teams</p>
                <span className="text-[11px] text-slate-400" style={os}>{teams.length} {teams.length === 1 ? 'team' : 'teams'}</span>
              </div>

              {teams.length === 0 ? null : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {teamStats.map(team => (
                    <Link
                      key={team.id}
                      href={`/dashboard/team/${team.id}`}
                      className="group rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                    >
                      <div className="h-0.5 bg-[#E8102A]" />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="min-w-0">
                            <h3 className="text-[15px] text-slate-950 truncate font-semibold leading-tight" style={os}>
                              {team.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {team.age_group && (
                                <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded" style={{ ...os, border: '1px solid #e2e8f0' }}>
                                  {team.age_group}
                                </span>
                              )}
                              {team.myRole === 'assistant' && (
                                <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-100" style={os}>
                                  Assistant
                                </span>
                              )}
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                          <div>
                            <p className="text-[17px] text-slate-950 leading-none tracking-tight" style={os}>{team.playerCount}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Players</p>
                          </div>
                          <div>
                            <p className="text-[17px] text-slate-950 leading-none tracking-tight" style={os}>{team.clipCount}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Clips</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${team.activePlayerCount > 0 ? 'bg-green-500' : 'bg-slate-300'}`} />
                              <p className="text-[11px] text-slate-600 truncate">
                                {team.activePlayerCount > 0 ? `${team.activePlayerCount} active` : 'No activity'}
                              </p>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {team.lastActivity ? fmtDate(team.lastActivity) : 'No clips yet'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* ── Recent activity feed ── */}
            {(allClips ?? []).length > 0 && (
              <ActivityFeed
                clips={allClips ?? []}
                playerNameMap={allPlayerNameMap}
                totalClips={(allClips ?? []).length}
              />
            )}
          </>
        ) : (
          /* ── Player view ── */
          <div className="space-y-6">
            {frozen && <AgeStopNotice />}
            {!frozen && (<>
            {/* Welcome hero */}
            <div className="relative rounded-2xl overflow-hidden" style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div className="h-px bg-[#E8102A]" />
              <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(232,16,42,0.04) 0%, transparent 70%)' }} />

              <div className="relative px-4 sm:px-7 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl text-white shrink-0"
                  style={{ ...os, background: '#E8102A', boxShadow: '0 4px 12px rgba(232,16,42,0.2)' }}
                >
                  {(playerRow?.full_name ?? 'P').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#E8102A] tracking-[0.3em] mb-1" style={os}>Welcome Back</p>
                  <h1 className="text-2xl text-slate-950 leading-tight truncate tracking-tight" style={os}>
                    {playerRow?.full_name ?? 'Pitcher'}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {(myClips?.length ?? 0) === 0
                      ? 'Ready to start your development journey?'
                      : `${myClips!.length} clip${myClips!.length === 1 ? '' : 's'} uploaded · Keep grinding.`}
                  </p>
                  <Link
                    href="/player-settings"
                    className="inline-flex items-center justify-center min-h-11 mt-3 px-4 rounded-lg border border-[#e2e8f0] text-sm text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                    style={os}
                  >
                    My Profile
                  </Link>
                </div>
                {playerRow && (
                  <UploadButton playerId={playerRow.id} playerName={playerRow.full_name ?? 'Player'} consent={playerRow} viewer="player" />
                )}
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100" style={{ borderTop: '1px solid #e2e8f0' }}>
                {[
                  { label: 'Clips',           value: myClips?.length ?? 0 },
                  { label: 'Pitches Tracked', value: myMetrics?.length ?? 0 },
                  { label: 'Best Velo',        value: bestVelo ? `${bestVelo}` : '—' },
                ].map(s => (
                  <div key={s.label} className="px-5 py-4 text-center">
                    <p className="text-xl text-slate-950 tracking-tight" style={os}>{s.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {(!myClips || myClips.length === 0) ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { title: 'Upload a Clip', desc: 'Film your bullpen or game appearance and upload it. Your coach gets notified instantly.' },
                    { title: 'Track Metrics', desc: 'Your coach uploads Rapsodo data linked to your clips: velocity, spin rate, movement.' },
                    { title: 'Get Feedback',  desc: 'Coaches draw directly on your video and leave voice notes. See exactly what to work on.' },
                  ].map(card => (
                    <div key={card.title} className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <h3 className="text-sm text-slate-950 mb-2 tracking-tight" style={os}>{card.title}</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">{card.desc}</p>
                    </div>
                  ))}
                </div>

                {playerRow && (
                  <div className="rounded-xl px-6 py-10 text-center" style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                    <h3 className="text-base text-slate-950 mb-2 tracking-tight" style={os}>Upload Your First Clip</h3>
                    <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">Film with your phone, upload here, and your coach starts analyzing.</p>
                    <UploadButton playerId={playerRow.id} playerName={playerRow.full_name ?? 'Player'} consent={playerRow} viewer="player" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(myMetrics?.length ?? 0) > 0 && (
                  <>
                    <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div className="h-0.5 bg-[#E8102A]" />
                      <div className="p-5">
                        <p className="text-[12px] text-[#E8102A] tracking-[0.2em] mb-4" style={os}>Career Stats</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            { label: 'Pitches Logged', value: myMetrics!.length },
                            { label: 'Best Velo',       value: bestVelo ? `${bestVelo} mph` : '—' },
                            { label: 'Avg Velo',        value: avgVelo  ? `${avgVelo} mph`  : '—' },
                            { label: 'Best Spin',       value: bestSpin ? `${bestSpin.toLocaleString()} rpm` : '—' },
                          ].map(stat => (
                            <div key={stat.label} className="text-center">
                              <p className="text-xl text-slate-950 tracking-tight" style={os}>{stat.value}</p>
                              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {bestPitch && (
                      <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <div className="h-px bg-[#E8102A]" />
                        <div className="p-5">
                          <p className="text-[12px] text-[#E8102A] tracking-[0.2em] mb-3" style={os}>Best Pitch</p>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                            <div>
                              <p className="text-3xl sm:text-4xl text-slate-950 leading-none tracking-tight" style={os}>
                                {bestPitch.velocity}
                                <span className="text-base text-slate-400 ml-1">mph</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-2">
                                {bestPitch.pitch_type ?? 'Unknown pitch'}
                                {bestPitch.spin_rate ? ` · ${bestPitch.spin_rate.toLocaleString()} rpm` : ''}
                              </p>
                              <p className="text-xs text-slate-400 mt-1 truncate max-w-[200px]">
                                {myClipTitleMap[bestPitch.clip_id] ?? ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#E8102A] tracking-[0.3em]" style={os}>Your Clips ({myClips.length})</p>
                  <Link href="/player-settings" className="text-xs text-slate-400 hover:text-slate-700 transition-colors" style={os}>
                    Edit Profile →
                  </Link>
                </div>

                <div className="space-y-2">
                  {myClips.map((clip, i) => (
                    <div
                      key={clip.id}
                      className="group flex items-center gap-3 sm:gap-4 rounded-xl px-4 sm:px-5 py-3 sm:py-4 transition-all"
                      style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-slate-100">
                        <svg className="w-5 h-5 text-[#E8102A]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                      <Link href={`/clips/${clip.id}`} className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 group-hover:text-slate-950 truncate transition-colors">{clip.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fmtClipDate((clip as { session_date?: string | null }).session_date ?? null, clip.created_at)}
                        </p>
                      </Link>
                      {i === 0 && (
                        <span className="text-xs bg-[#E8102A] text-white px-2 py-0.5 rounded shrink-0" style={os}>Latest</span>
                      )}
                      <Link
                        href={`/clips/compare?a=${clip.id}`}
                        className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-[#E8102A] hover:bg-slate-50 transition-colors"
                        title="Compare"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                        </svg>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>)}
          </div>
        )}
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
