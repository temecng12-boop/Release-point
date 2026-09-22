import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import PlayerRow from '@/app/dashboard/player-row'
import TeamInviteForm from './team-invite-form'
import Logo from '@/components/Logo'
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
        .eq('coach_id', user.id)
        .order('invited_at', { ascending: false })
    : { data: [] }

  const playerIds = players?.map((p) => p.id) ?? []
  const { data: clips } = playerIds.length > 0
    ? await supabaseAdmin
        .from('clips')
        .select('id, title, created_at, session_date, player_id')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #DDE4ED' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Logo size="sm" href="/dashboard" className="shrink-0" />
          <span className="text-[#DDE4ED] shrink-0">/</span>
          <Link href="/dashboard" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors shrink-0" style={oswald}>Dashboard</Link>
          <span className="text-[#DDE4ED] shrink-0">/</span>
          <span className="text-xs text-[#456080] truncate" style={oswald}>{team.name}</span>
        </div>
        <Link href="/dashboard" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors shrink-0" style={oswald}>
          ← Back
        </Link>
      </header>

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

        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-3" style={oswald}>
            Roster ({players?.length ?? 0})
          </p>

          {!players || players.length === 0 ? (
            <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm px-6 py-10 text-center">
              <p className="text-sm text-[#7A92A8]">No players on this team yet — invite someone above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={{ ...p, teamIds: [id] }}
                  clips={clips?.filter((c) => c.player_id === p.id) ?? []}
                  teams={[team]}
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
