import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import EditProfileForm from './edit-profile-form'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, team_name')
    .eq('id', user.id)
    .single()

  const isCoach = profile?.role === 'coach'
  const displayName = profile?.full_name ?? user.email ?? ''

  let playerRow: { id: string; age_group: string | null; position: string | null } | null = null
  let myClips: { id: string; title: string; created_at: string; session_date?: string | null }[] = []
  let rosterCount = 0
  let teamCount = 0

  if (!isCoach) {
    const { data: pr } = await supabase
      .from('players')
      .select('id, age_group, position')
      .eq('user_id', user.id)
      .single()
    playerRow = pr ?? null
    if (playerRow) {
      const { data: clips } = await supabase
        .from('clips')
        .select('id, title, created_at, session_date')
        .eq('player_id', playerRow.id)
        .order('created_at', { ascending: false })
      myClips = clips ?? []
    }
  } else {
    const { count: rc } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id)
    rosterCount = rc ?? 0

    const { count: tc } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id)
    teamCount = tc ?? 0
  }

  const teamName = (profile as { team_name?: string | null })?.team_name ?? ''

  return (
    <div className="min-h-screen bg-[#060F1A]">
      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(6,15,26,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(28,58,92,0.4)' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span>⚾</span>
            <span className="text-sm tracking-widest text-[#E8EDF5] hidden sm:block" style={oswald}>Release Point</span>
          </Link>
          <span className="text-[#1C3A5C]">/</span>
          <span className="text-xs text-[#4A6880]" style={oswald}>Profile</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>
            Dashboard
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors px-2 py-1" style={oswald}>
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        {/* Profile hero card */}
        <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl overflow-hidden">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-7">
            <div className="flex items-center gap-5">
              <div
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1C3A5C] to-[#0B1E36] border border-[#1C3A5C] flex items-center justify-center text-xl text-[#9FB3CC] shrink-0"
                style={oswald}
              >
                {initials(displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl text-[#E8EDF5] truncate" style={oswald}>{displayName}</h1>
                <p className="text-xs text-[#4A6880] mt-0.5 truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-[#14304F] text-[#9FB3CC] px-2 py-0.5 rounded" style={oswald}>
                    {profile?.role ?? 'player'}
                  </span>
                  {isCoach && teamName && (
                    <span className="text-xs text-[#4A6880]">{teamName}</span>
                  )}
                  {!isCoach && playerRow?.age_group && (
                    <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full">{playerRow.age_group}</span>
                  )}
                  {!isCoach && playerRow?.position && (
                    <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full capitalize">{playerRow.position}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats row */}
            {isCoach && (
              <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#1C3A5C]">
                <div>
                  <p className="text-2xl text-[#E8EDF5]" style={oswald}>{rosterCount}</p>
                  <p className="text-xs text-[#4A6880] mt-0.5">Total Players</p>
                </div>
                <div>
                  <p className="text-2xl text-[#E8EDF5]" style={oswald}>{teamCount}</p>
                  <p className="text-xs text-[#4A6880] mt-0.5">Teams</p>
                </div>
              </div>
            )}
            {!isCoach && (
              <div className="mt-6 pt-6 border-t border-[#1C3A5C]">
                <p className="text-2xl text-[#E8EDF5]" style={oswald}>{myClips.length}</p>
                <p className="text-xs text-[#4A6880] mt-0.5">Clips</p>
              </div>
            )}
          </div>
        </div>

        {/* Coach edit form */}
        {isCoach && <EditProfileForm initialName={profile?.full_name ?? ''} initialTeamName={teamName} />}

        {/* Player clips */}
        {!isCoach && myClips.length > 0 && (
          <div>
            <p className="text-xs text-[#4A6880] mb-3 tracking-widest" style={oswald}>Your Clips</p>
            <div className="bg-[#0B1E36] rounded-xl border border-[#1C3A5C] divide-y divide-[#1C3A5C] overflow-hidden">
              {myClips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#112940] transition-colors"
                >
                  <span className="text-sm text-[#E8EDF5] truncate">{clip.title}</span>
                  <span className="text-xs text-[#4A6880] shrink-0 ml-3">{fmtDate(clip.created_at)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!isCoach && myClips.length === 0 && (
          <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl px-6 py-12 text-center">
            <p className="text-sm text-[#4A6880]">No clips yet — your coach will upload them.</p>
          </div>
        )}

        {isCoach && (
          <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-[#E8EDF5]" style={oswald}>Manage Roster</p>
              <p className="text-xs text-[#4A6880] mt-0.5">View teams, players, and clips</p>
            </div>
            <Link href="/dashboard" className="text-xs text-[#C8102E] hover:text-red-400 transition-colors" style={oswald}>
              Go to Dashboard →
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
