import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectPlayersWithConsent } from '@/lib/consent-server'
import { ownTeamIdsByPlayer } from '@/lib/auth/roster-access'
import PlayerRow from '@/app/dashboard/player-row'
import TeamInviteForm from './team-invite-form'
import TeamLeaderboard from './team-leaderboard'
import AddCoachForm from './add-coach-form'
import DeleteTeamButton from './delete-team-button'
import { loadTeamCoaches } from '@/lib/team-coaches'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type TeamRosterPlayer = {
  id: string
  full_name: string
  email: string | null
  accepted_at: string | null
  age_group: string | null
  position: string | null
  positions?: string[] | null
  coach_id: string | null
  user_id?: string | null
  consent_given_at: string | null
  adult_confirmed_at: string | null
  age_band?: string | null
  age_confirmed_at?: string | null
  age_band_coach?: string | null
  age_band_self?: string | null
  consent_rules_pending_migration?: boolean
  age_band_pending_migration?: boolean
}

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

  if (!team) notFound()

  // Check if current user is a coach on this team (organizer or assistant)
  const { data: myMembership } = await supabaseAdmin
    .from('team_coaches')
    .select('role')
    .eq('team_id', id)
    .eq('coach_id', user.id)
    .single()

  if (!myMembership) notFound()

  const isOrganizer = myMembership.role === 'organizer'

  // All coaches on this team with name and email (organizer first)
  const teamCoaches = await loadTeamCoaches(id)

  const { data: teamPlayerLinks } = await supabaseAdmin
    .from('player_teams')
    .select('player_id')
    .eq('team_id', id)

  const teamPlayerIds = teamPlayerLinks?.map((r) => r.player_id) ?? []

  const { data: players } = teamPlayerIds.length > 0
    ? await selectPlayersWithConsent<TeamRosterPlayer[]>(
        'id, full_name, email, accepted_at, age_group, position, positions, coach_id, user_id',
        (cols) => supabaseAdmin.from('players').select(cols).in('id', teamPlayerIds).order('full_name', { ascending: true }),
      )
    : { data: [] as TeamRosterPlayer[] }

  const rosterPlayerIds = (players ?? []).map((p) => p.id)
  const consentQuery = rosterPlayerIds.length > 0
    ? await supabaseAdmin.from('player_video_consents').select('player_id').in('player_id', rosterPlayerIds)
    : { data: [] as { player_id: string }[], error: null }
  const consentRows = consentQuery.error ? [] : (consentQuery.data ?? [])
  const consented = new Set((consentRows as { player_id: string }[]).map((r) => r.player_id))
  const rosterPlayers = (players ?? []).map((p) => ({
    ...p,
    roster_video_consent: consented.has(p.id),
  }))
  const rosterCount = rosterPlayers.length

  const playerIds = rosterPlayers.map((p) => p.id)

  // The edit form saves the player's full set of this coach's teams, so give
  // it all of the coach's teams and every one of them the player is on.
  // Otherwise saving here would drop the player from the coach's other teams.
  const { data: coachTeamLinks } = await supabaseAdmin
    .from('team_coaches')
    .select('team_id, teams(id, name)')
    .eq('coach_id', user.id)
  const coachTeams = (coachTeamLinks ?? [])
    .map((r: { team_id: string; teams: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
      return t ? { id: t.id, name: t.name } : null
    })
    .filter((t): t is { id: string; name: string } => t !== null)
  const coachTeamIds = (coachTeams ?? []).map((t) => t.id as string)
  const { data: ownPlayerLinks } = playerIds.length > 0 && coachTeamIds.length > 0
    ? await supabaseAdmin
        .from('player_teams')
        .select('player_id, team_id')
        .in('player_id', playerIds)
        .in('team_id', coachTeamIds)
    : { data: [] }
  const teamIdsByPlayer = ownTeamIdsByPlayer(
    (ownPlayerLinks ?? []) as { player_id: string; team_id: string }[],
    coachTeamIds,
  )
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

  const leaderboardEntries = rosterPlayers.map(p => {
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

        <AddCoachForm
          teamId={id}
          coaches={teamCoaches}
          isOrganizer={isOrganizer}
        />

        <TeamLeaderboard entries={leaderboardEntries} />

        <div>
          <p className="text-[10px] tracking-[0.3em] text-[color:var(--rp-navy,#023167)] mb-3" style={oswald}>
            Roster ({rosterCount})
          </p>

          {rosterCount === 0 ? (
            <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm px-6 py-10 text-center">
              <p className="text-sm text-[#3D5166]">No players on this team yet. Add someone above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rosterPlayers.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={{ ...p, email: p.email ?? '', teamIds: teamIdsByPlayer[p.id] ?? [id] }}
                  clips={clips?.filter((c) => c.player_id === p.id) ?? []}
                  teams={coachTeams && coachTeams.length > 0 ? coachTeams : [team]}
                  sessions={(sessions ?? []).filter(s => s.player_id === p.id) as import('@/app/dashboard/bullpen-modal').BullpenSession[]}
                  isOwnPlayer={p.coach_id === user.id}
                  canWrite
                />
              ))}
            </div>
          )}
        </div>

        {isOrganizer && (
          <div className="flex justify-end">
            <DeleteTeamButton teamId={id} teamName={team.name} />
          </div>
        )}
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
