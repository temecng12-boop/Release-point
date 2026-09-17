import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') redirect('/dashboard')

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, email, accepted_at, age_group, position, coach_id')
    .eq('id', id)
    .single()

  if (!player || player.coach_id !== user.id) notFound()

  const { data: clips } = await supabase
    .from('clips')
    .select('id, title, created_at, session_date')
    .eq('player_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[#060F1A]">
      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(11,30,54,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1C3A5C' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span>⚾</span>
            <span className="text-sm tracking-widest text-[#E8EDF5] hidden sm:block" style={oswald}>Release Point</span>
          </Link>
          <span className="text-[#1C3A5C]">/</span>
          <Link href="/dashboard" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>Dashboard</Link>
          <span className="text-[#1C3A5C]">/</span>
          <span className="text-xs text-[#4A6880]" style={oswald}>{player.full_name}</span>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors px-2 py-1" style={oswald}>
            Sign Out
          </button>
        </form>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        {/* Player hero card */}
        <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl overflow-hidden">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-7">
            <div className="flex items-center gap-5">
              <div
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1C3A5C] to-[#0B1E36] border border-[#1C3A5C] flex items-center justify-center text-xl text-[#9FB3CC] shrink-0"
                style={oswald}
              >
                {initials(player.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl text-[#E8EDF5] truncate" style={oswald}>{player.full_name}</h1>
                <p className="text-xs text-[#4A6880] mt-0.5 truncate">{player.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {player.age_group && (
                    <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full">{player.age_group}</span>
                  )}
                  {player.position && (
                    <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full capitalize">{player.position}</span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded tracking-wide ${player.accepted_at ? 'bg-green-900/40 text-green-400' : 'bg-[#1C3A5C] text-[#9FB3CC]'}`}
                    style={oswald}
                  >
                    {player.accepted_at ? 'Active' : 'Invited'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#1C3A5C]">
              <div>
                <p className="text-2xl text-[#E8EDF5]" style={oswald}>{clips?.length ?? 0}</p>
                <p className="text-xs text-[#4A6880] mt-0.5">Clips</p>
              </div>
              {player.accepted_at && (
                <div>
                  <p className="text-sm text-[#E8EDF5]" style={oswald}>{fmtDate(player.accepted_at)}</p>
                  <p className="text-xs text-[#4A6880] mt-0.5">Joined</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clips */}
        <div>
          <p className="text-xs text-[#4A6880] mb-3 tracking-widest" style={oswald}>
            Clips ({clips?.length ?? 0})
          </p>

          {!clips || clips.length === 0 ? (
            <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-[#4A6880]">No clips yet for this player.</p>
            </div>
          ) : (
            <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl divide-y divide-[#1C3A5C] overflow-hidden">
              {clips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#112940] transition-colors"
                >
                  <span className="text-sm text-[#E8EDF5] truncate">{clip.title}</span>
                  <span className="text-xs text-[#4A6880] shrink-0 ml-3">
                    {fmtDate((clip as { session_date?: string | null }).session_date ?? clip.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
