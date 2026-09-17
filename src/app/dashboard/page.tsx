import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import InviteForm from './invite-form'
import UploadButton from './upload-button'
import PlayerRow from './player-row'
import CreateTeamButton from './create-team-button'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, team_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'guardian') redirect('/guardian')

  const isCoach = profile?.role === 'coach'

  // Coach: fetch teams
  const { data: teams } = isCoach
    ? await supabase
        .from('teams')
        .select('id, name, age_group')
        .eq('coach_id', user.id)
        .order('created_at')
    : { data: null }

  // Coach: fetch all players (with team_id)
  const { data: players } = isCoach
    ? await supabase
        .from('players')
        .select('id, full_name, email, accepted_at, age_group, position, team_id, consent_given_at')
        .eq('coach_id', user.id)
        .order('invited_at', { ascending: false })
    : { data: null }

  // Coach: fetch all clips
  const playerIds = players?.map((p) => p.id) ?? []
  const { data: allClips } = isCoach && playerIds.length > 0
    ? await supabase
        .from('clips')
        .select('id, title, created_at, session_date, player_id')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Player: fetch own row + clips
  const { data: playerRow } = !isCoach
    ? await supabase
        .from('players')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single()
    : { data: null }

  const { data: myClips } = !isCoach && playerRow
    ? await supabase
        .from('clips')
        .select('id, title, created_at, session_date')
        .eq('player_id', playerRow.id)
        .order('created_at', { ascending: false })
    : { data: null }

  function fmtDate(sessionDate: string | null, createdAt: string) {
    const iso = sessionDate ?? createdAt
    return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[#060F1A]">
      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(6,15,26,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(28,58,92,0.4)' }}
      >
        <div className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-sm tracking-widest text-[#E8EDF5] hidden sm:block" style={oswald}>Release Point</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4A6880] hidden sm:block truncate max-w-[140px]">
              {profile?.full_name ?? user.email}
            </span>
            <span className="text-xs bg-[#14304F] text-[#9FB3CC] px-2 py-0.5 rounded" style={oswald}>
              {profile?.role ?? 'player'}
            </span>
          </div>
          <Link href="/profile" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>
            Profile
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        {isCoach ? (
          <>
            {/* Teams section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>
                  Your Teams
                </p>
                <CreateTeamButton />
              </div>

              {!teams || teams.length === 0 ? (
                <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] px-6 py-12 text-center">
                  <p className="text-sm text-[#4A6880] mb-4">
                    No teams yet — create one to start organizing your roster.
                  </p>
                  <CreateTeamButton />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teams.map((team) => {
                    const count = players?.filter((p) => (p as { team_id?: string | null }).team_id === team.id).length ?? 0
                    return (
                      <Link
                        key={team.id}
                        href={`/dashboard/team/${team.id}`}
                        className="block bg-[#0B1E36] border border-[#1C3A5C] rounded-xl overflow-hidden hover:bg-[#112940] transition-colors"
                      >
                        <div className="h-1 bg-[#C8102E]" />
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm text-[#E8EDF5] leading-tight" style={oswald}>{team.name}</p>
                            <span className="text-xs text-[#4A6880] shrink-0 ml-2">
                              {count} {count === 1 ? 'player' : 'players'}
                            </span>
                          </div>
                          {team.age_group && (
                            <span className="text-[10px] border border-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded" style={oswald}>
                              {team.age_group}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Unassigned players */}
            {(() => {
              const unassigned = players?.filter((p) => !(p as { team_id?: string | null }).team_id) ?? []
              if (unassigned.length === 0) return null
              return (
                <div>
                  <p className="text-xs text-[#4A6880] tracking-widest mb-3" style={oswald}>
                    Unassigned Players
                  </p>
                  <div className="space-y-3">
                    {unassigned.map((p) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        clips={allClips?.filter((c) => c.player_id === p.id) ?? []}
                      />
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Invite section — invite without assigning to a specific team */}
            <div>
              <p className="text-xs text-[#4A6880] tracking-widest mb-3" style={oswald}>
                Invite a Player
              </p>
              <InviteForm />
            </div>
          </>
        ) : (
          /* Player view */
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>
                Your Clips
              </p>
              {playerRow && <UploadButton playerId={playerRow.id} playerName={playerRow.full_name ?? 'Player'} />}
            </div>

            {!myClips || myClips.length === 0 ? (
              <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] px-6 py-14 text-center">
                <p className="text-sm text-[#4A6880]">No clips yet — upload your first one above.</p>
              </div>
            ) : (
              <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] divide-y divide-[#1C3A5C]">
                {myClips.map((clip) => (
                  <Link
                    key={clip.id}
                    href={`/clips/${clip.id}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-[#112940] transition-colors"
                  >
                    <span className="text-sm text-[#E8EDF5]">{clip.title}</span>
                    <span className="text-xs text-[#9FB3CC]">
                      {fmtDate((clip as { session_date?: string | null }).session_date ?? null, clip.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
