import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import PlayerRow from '@/app/dashboard/player-row'
import TeamInviteForm from './team-invite-form'
import TeamLeaderboard from './team-leaderboard'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, age_group, coach_id')
    .eq('id', id)
    .single()

  if (!team || team.coach_id !== user.id) notFound()

  const { data: teamPlayerLinks } = await supabaseAdmin
    .from('player_teams')
    .select('player_id')
    .eq('team_id', id)

  const teamPlayerIds = teamPlayerLinks?.map((r) => r.player_id) ?? []

  const { data: players } = teamPlayerIds.length > 0
    ? await supabaseAdmin
        .from('players')
        .select('id, full_name, email, accepted_at, age_group, position, consent_given_at')
        .in('id', teamPlayerIds)
        .order('full_name', { ascending: true })
    : { data: [] }

  const playerIds = players?.map((p) => p.id) ?? []
  const { data: clips } = playerIds.length > 0
    ? await supabaseAdmin
        .from('clips')
        .select('id, title, created_at, session_date, player_id')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const { data: sessions } = playerIds.length > 0
    ? await supabaseAdmin
        .from('bullpen_sessions')
        .select('id, player_id, session_date, status, pitches, notes, created_at')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Fetch pitch metrics for all clips on this team for the leaderboard
  const clipIds = (clips ?? []).map(c => c.id)
  const { data: allMetrics } = clipIds.length > 0
    ? await supabaseAdmin
        .from('pitch_metrics')
        .select('clip_id, velocity, spin_rate')
        .in('clip_id', clipIds)
    : { data: [] }

  // Build clip → player lookup
  const clipToPlayer: Record<string, string> = {}
  for (const c of clips ?? []) clipToPlayer[c.id] = c.player_id

  // Aggregate per player
  const playerMetricMap: Record<string, { velocities: number[]; spinRates: number[] }> = {}
  for (const m of allMetrics ?? []) {
    const pid = clipToPlayer[m.clip_id]
    if (!pid) continue
    if (!playerMetricMap[pid]) playerMetricMap[pid] = { velocities: [], spinRates: [] }
    if (m.velocity != null) playerMetricMap[pid].velocities.push(m.velocity)
    if (m.spin_rate != null) playerMetricMap[pid].spinRates.push(m.spin_rate)
  }

  const leaderboardEntries = (players ?? []).map(p => {
    const pm = playerMetricMap[p.id]
    const velocities = pm?.velocities ?? []
    const spinRates = pm?.spinRates ?? []
    return {
      playerId: p.id,
      playerName: p.full_name,
      maxVelocity: velocities.length > 0 ? Math.max(...velocities) : null,
      avgVelocity: velocities.length > 0 ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : null,
      maxSpinRate: spinRates.length > 0 ? Math.max(...spinRates) : null,
      avgSpinRate: spinRates.length > 0 ? Math.round(spinRates.reduce((a, b) => a + b, 0) / spinRates.length) : null,
      pitchCount: velocities.length,
    }
  })

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: team.name }]}
        showSignOut
      />

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        {/* Team header */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg text-[#0F1F33] tracking-wide" style={oswald}>
            {team.name}
          </h1>
          {team.age_group && (
            <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full">
              {team.age_group}
            </span>
          )}
        </div>

        <TeamInviteForm teamId={id} />

        <TeamLeaderboard entries={leaderboardEntries} />

        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-3" style={oswald}>
            Roster ({players?.length ?? 0})
          </p>

          {!players || players.length === 0 ? (
            <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm px-6 py-10 text-center">
              <p className="text-sm text-[#3D5166]">No players on this team yet — invite someone above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={{ ...p, teamIds: [id] }}
                  clips={clips?.filter((c) => c.player_id === p.id) ?? []}
                  teams={[team]}
                  sessions={(sessions ?? []).filter(s => s.player_id === p.id) as import('@/app/dashboard/bullpen-modal').BullpenSession[]}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
