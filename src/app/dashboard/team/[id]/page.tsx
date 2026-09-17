import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PlayerRow from '@/app/dashboard/player-row'
import TeamInviteForm from './team-invite-form'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, age_group, coach_id')
    .eq('id', id)
    .single()

  if (!team || team.coach_id !== user.id) notFound()

  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, email, accepted_at, age_group, position, consent_given_at')
    .eq('coach_id', user.id)
    .eq('team_id', id)
    .order('invited_at', { ascending: false })

  const playerIds = players?.map((p) => p.id) ?? []
  const { data: clips } = playerIds.length > 0
    ? await supabase
        .from('clips')
        .select('id, title, created_at, session_date, player_id')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="min-h-screen bg-[#060F1A]">
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(6,15,26,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(28,58,92,0.4)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span>⚾</span>
            <span className="text-sm tracking-widest text-[#E8EDF5] hidden sm:block" style={oswald}>Release Point</span>
          </Link>
          <span className="text-[#1C3A5C] shrink-0">/</span>
          <Link href="/dashboard" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors shrink-0" style={oswald}>Dashboard</Link>
          <span className="text-[#1C3A5C] shrink-0">/</span>
          <span className="text-xs text-[#9FB3CC] truncate" style={oswald}>{team.name}</span>
        </div>
        <Link href="/dashboard" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors shrink-0" style={oswald}>
          ← Back
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        {/* Team header */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg text-[#E8EDF5] tracking-wide" style={oswald}>
            {team.name}
          </h1>
          {team.age_group && (
            <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full">
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
            <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] px-6 py-10 text-center">
              <p className="text-sm text-[#4A6880]">No players on this team yet — invite someone above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  clips={clips?.filter((c) => c.player_id === p.id) ?? []}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
