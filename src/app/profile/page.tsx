import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { signOut } from '@/app/actions/auth'
import EditProfileForm from './edit-profile-form'
import DeleteAccountButton from './delete-account-button'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'

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

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, role, team_name')
    .eq('id', user.id)
    .single()

  const isCoach = (profile?.role ?? user.user_metadata?.role) === 'coach'
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
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #DDE4ED' }}
      >
        <div className="flex items-center gap-4">
          <Logo size="sm" href="/dashboard" />
          <span className="text-[#DDE4ED]">/</span>
          <span className="text-xs text-[#7A92A8]" style={oswald}>Profile</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors" style={oswald}>
            Dashboard
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors px-2 py-1" style={oswald}>
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        {/* Profile hero card */}
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-7">
            <div className="flex items-center gap-5">
              <div
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1C3A5C] to-[#EEF2F7] border border-[#DDE4ED] flex items-center justify-center text-xl text-white shrink-0"
                style={oswald}
              >
                {initials(displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl text-[#0F1F33] truncate" style={oswald}>{displayName}</h1>
                <p className="text-xs text-[#7A92A8] mt-0.5 truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded" style={oswald}>
                    {profile?.role ?? user.user_metadata?.role ?? 'coach'}
                  </span>
                  {isCoach && teamName && (
                    <span className="text-xs text-[#7A92A8]">{teamName}</span>
                  )}
                  {!isCoach && playerRow?.age_group && (
                    <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full">{playerRow.age_group}</span>
                  )}
                  {!isCoach && playerRow?.position && (
                    <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full capitalize">{playerRow.position}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats row */}
            {isCoach && (
              <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#DDE4ED]">
                <div>
                  <p className="text-2xl text-[#0F1F33]" style={oswald}>{rosterCount}</p>
                  <p className="text-xs text-[#7A92A8] mt-0.5">Total Players</p>
                </div>
                <div>
                  <p className="text-2xl text-[#0F1F33]" style={oswald}>{teamCount}</p>
                  <p className="text-xs text-[#7A92A8] mt-0.5">Teams</p>
                </div>
              </div>
            )}
            {!isCoach && (
              <div className="mt-6 pt-6 border-t border-[#DDE4ED]">
                <p className="text-2xl text-[#0F1F33]" style={oswald}>{myClips.length}</p>
                <p className="text-xs text-[#7A92A8] mt-0.5">Clips</p>
              </div>
            )}
          </div>
        </div>

        {/* Coach edit form */}
        {isCoach && <EditProfileForm initialName={profile?.full_name ?? ''} initialTeamName={teamName} />}

        {/* Player clips */}
        {!isCoach && myClips.length > 0 && (
          <div>
            <p className="text-xs text-[#7A92A8] mb-3 tracking-widest" style={oswald}>Your Clips</p>
            <div className="bg-white rounded-xl border border-[#DDE4ED] divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
              {myClips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F0F4F8] transition-colors"
                >
                  <span className="text-sm text-[#0F1F33] truncate">{clip.title}</span>
                  <span className="text-xs text-[#7A92A8] shrink-0 ml-3">{fmtDate(clip.created_at)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!isCoach && myClips.length === 0 && (
          <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-[#7A92A8]">No clips yet — your coach will upload them.</p>
          </div>
        )}

        {isCoach && (
          <div className="bg-white border border-[#DDE4ED] rounded-xl p-5 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm text-[#0F1F33]" style={oswald}>Manage Roster</p>
              <p className="text-xs text-[#7A92A8] mt-0.5">View teams, players, and clips</p>
            </div>
            <Link href="/dashboard" className="text-xs text-[#C8102E] hover:text-red-400 transition-colors" style={oswald}>
              Go to Dashboard →
            </Link>
          </div>
        )}
        {/* Danger zone */}
        <div className="border border-[#C8102E]/20 rounded-xl overflow-hidden">
          <div className="h-px bg-[#C8102E]/20" />
          <div className="p-5">
            <p className="text-sm text-[#0F1F33] mb-1" style={oswald}>Delete Account</p>
            <p className="text-xs text-[#7A92A8] mb-4">Permanently removes your account and all associated data. This cannot be undone.</p>
            <DeleteAccountButton />
          </div>
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
