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
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #DDE4ED' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span>⚾</span>
            <span className="text-sm tracking-widest text-[#1C2E4A] hidden sm:block" style={oswald}>Release Point</span>
          </Link>
          <span className="text-[#DDE4ED]">/</span>
          <Link href="/dashboard" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors" style={oswald}>Dashboard</Link>
          <span className="text-[#DDE4ED]">/</span>
          <span className="text-xs text-[#7A92A8]" style={oswald}>{player.full_name}</span>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors px-2 py-1" style={oswald}>
            Sign Out
          </button>
        </form>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        {/* Player hero card */}
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-7">
            <div className="flex items-center gap-5">
              <div
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1C3A5C] to-[#EEF2F7] border border-[#DDE4ED] flex items-center justify-center text-xl text-white shrink-0"
                style={oswald}
              >
                {initials(player.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl text-[#0F1F33] truncate" style={oswald}>{player.full_name}</h1>
                <p className="text-xs text-[#7A92A8] mt-0.5 truncate">{player.email}</p>
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
                    {player.accepted_at ? 'Active' : 'Invited'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#DDE4ED]">
              <div>
                <p className="text-2xl text-[#0F1F33]" style={oswald}>{clips?.length ?? 0}</p>
                <p className="text-xs text-[#7A92A8] mt-0.5">Clips</p>
              </div>
              {player.accepted_at && (
                <div>
                  <p className="text-sm text-[#0F1F33]" style={oswald}>{fmtDate(player.accepted_at)}</p>
                  <p className="text-xs text-[#7A92A8] mt-0.5">Joined</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clips */}
        <div>
          <p className="text-xs text-[#7A92A8] mb-3 tracking-widest" style={oswald}>
            Clips ({clips?.length ?? 0})
          </p>

          {!clips || clips.length === 0 ? (
            <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-[#7A92A8]">No clips yet for this player.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#DDE4ED] rounded-xl divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
              {clips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F0F4F8] transition-colors"
                >
                  <span className="text-sm text-[#0F1F33] truncate">{clip.title}</span>
                  <span className="text-xs text-[#7A92A8] shrink-0 ml-3">
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
