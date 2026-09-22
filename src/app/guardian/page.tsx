import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDate(sessionDate: string | null, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function GuardianPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'guardian') redirect('/dashboard')

  const { data: guardian } = await supabase
    .from('guardians')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const { data: players } = guardian
    ? await supabase
        .from('players')
        .select('id, full_name, age_group, position')
        .eq('guardian_id', guardian.id)
    : { data: [] }

  const playerIds = players?.map(p => p.id) ?? []
  const { data: clips } = playerIds.length > 0
    ? await supabase
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
        <div className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-sm tracking-widest text-[#1C2E4A] hidden sm:block" style={oswald}>Release Point</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#7A92A8] hidden sm:block truncate max-w-[140px]">
            {profile?.full_name ?? user.email}
          </span>
          <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded" style={oswald}>Guardian</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors" style={oswald}>
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-8">
        {players && players.length > 0 ? players.map(player => {
          const playerClips = clips?.filter(c => c.player_id === player.id) ?? []
          return (
            <div key={player.id}>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Player</p>
                <h2 className="text-lg text-[#0F1F33]" style={oswald}>{player.full_name}</h2>
                {player.age_group && (
                  <span className="text-[10px] border border-[#DDE4ED] text-[#456080] px-2 py-0.5 rounded" style={oswald}>
                    {player.age_group}
                  </span>
                )}
                {player.position && (
                  <span className="text-[10px] border border-[#DDE4ED] text-[#456080] px-2 py-0.5 rounded capitalize" style={oswald}>
                    {player.position}
                  </span>
                )}
              </div>

              {playerClips.length === 0 ? (
                <div className="bg-white border border-[#DDE4ED] rounded-xl p-8 text-center shadow-sm">
                  <p className="text-sm text-[#7A92A8]">No clips yet — your player's coach will upload them.</p>
                </div>
              ) : (
                <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
                  <div className="h-1 bg-[#C8102E]" />
                  <div className="divide-y divide-[#DDE4ED]">
                    {playerClips.map(clip => (
                      <Link
                        key={clip.id}
                        href={`/clips/${clip.id}`}
                        className="flex items-center justify-between px-5 py-3 hover:bg-[#F0F4F8] transition-colors"
                      >
                        <span className="text-sm text-[#0F1F33]">{clip.title}</span>
                        <span className="text-xs text-[#7A92A8]">
                          {fmtDate(clip.session_date ?? null, clip.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }) : (
          <div className="bg-white border border-[#DDE4ED] rounded-xl p-12 text-center shadow-sm">
            <p className="text-sm text-[#7A92A8]">No players linked to your account yet.</p>
          </div>
        )}
      </main>
    </div>
  )
}
