import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import EditProfileForm from './edit-profile-form'
import DeleteAccountButton from './delete-account-button'
import AvatarUpload from './avatar-upload'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Profile = {
  full_name: string | null
  role: string
  team_name: string | null
  bio: string | null
  college: string | null
  playing_career: string | null
  coaching_since: number | null
  certifications: string[] | null
  location: string | null
  social_twitter: string | null
  social_instagram: string | null
  social_linkedin: string | null
  avatar_url: string | null
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, role, team_name, bio, college, playing_career, coaching_since, certifications, location, social_twitter, social_instagram, social_linkedin, avatar_url')
    .eq('id', user.id)
    .single() as { data: Profile | null }

  const isCoach = (profile?.role ?? user.user_metadata?.role) === 'coach'
  const displayName = profile?.full_name ?? user.email ?? ''

  let myClips: { id: string; title: string; created_at: string }[] = []
  let rosterCount = 0
  let teamCount = 0

  if (!isCoach) {
    const { data: pr } = await supabase.from('players').select('id').eq('user_id', user.id).single()
    if (pr) {
      const { data: clips } = await supabase
        .from('clips')
        .select('id, title, created_at')
        .eq('player_id', pr.id)
        .order('created_at', { ascending: false })
      myClips = clips ?? []
    }
  } else {
    const { count: rc } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('coach_id', user.id)
    rosterCount = rc ?? 0
    const { count: tc } = await supabase.from('teams').select('id', { count: 'exact', head: true }).eq('coach_id', user.id)
    teamCount = tc ?? 0
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Profile' }]}
        showSignOut
      />

      <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        {/* Profile hero */}
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-6">
            <div className="flex items-start gap-5">
              <AvatarUpload userId={user.id} currentAvatarUrl={profile?.avatar_url ?? null} displayName={displayName} />
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl text-[#0F1F33] truncate" style={oswald}>{displayName}</h1>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded" style={oswald}>
                    {profile?.role ?? user.user_metadata?.role ?? 'coach'}
                  </span>
                  {isCoach && profile?.location && (
                    <span className="text-xs text-[#3D5166]">📍 {profile.location}</span>
                  )}
                  {isCoach && profile?.coaching_since && (
                    <span className="text-xs text-[#3D5166]">Coaching since {profile.coaching_since}</span>
                  )}
                </div>
                {isCoach && profile?.bio && (
                  <p className="text-sm text-[#456080] mt-3 leading-relaxed">{profile.bio}</p>
                )}
              </div>
            </div>

            {isCoach && (
              <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-[#DDE4ED]">
                <div className="text-center">
                  <p className="text-2xl text-[#0F1F33]" style={oswald}>{rosterCount}</p>
                  <p className="text-xs text-[#3D5166] mt-0.5">Players</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl text-[#0F1F33]" style={oswald}>{teamCount}</p>
                  <p className="text-xs text-[#3D5166] mt-0.5">Teams</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl text-[#0F1F33]" style={oswald}>
                    {profile?.coaching_since ? (new Date().getFullYear() - profile.coaching_since) : '—'}
                  </p>
                  <p className="text-xs text-[#3D5166] mt-0.5">Yrs Coaching</p>
                </div>
              </div>
            )}

            {isCoach && (profile?.playing_career || profile?.college) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {profile?.college && (
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-3 py-1.5 rounded-full">
                    🎓 {profile.college}
                  </span>
                )}
                {profile?.playing_career && (
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-3 py-1.5 rounded-full">
                    ⚾ {profile.playing_career}
                  </span>
                )}
              </div>
            )}

            {isCoach && (profile?.certifications ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {profile!.certifications!.map(c => (
                  <span key={c} className="text-xs bg-[#C8102E]/10 text-[#C8102E] px-2.5 py-1 rounded-full" style={oswald}>
                    {c}
                  </span>
                ))}
              </div>
            )}

            {isCoach && (profile?.social_twitter || profile?.social_instagram || profile?.social_linkedin) && (
              <div className="flex gap-4 mt-4 pt-4 border-t border-[#DDE4ED]">
                {profile.social_twitter && <span className="text-xs text-[#3D5166]">🐦 {profile.social_twitter}</span>}
                {profile.social_instagram && <span className="text-xs text-[#3D5166]">📸 {profile.social_instagram}</span>}
                {profile.social_linkedin && <span className="text-xs text-[#3D5166]">💼 {profile.social_linkedin}</span>}
              </div>
            )}
          </div>
        </div>

        {isCoach && (
          <EditProfileForm
            initialName={profile?.full_name ?? ''}
            initialTeamName={profile?.team_name ?? ''}
            initialBio={profile?.bio ?? ''}
            initialCollege={profile?.college ?? ''}
            initialPlayingCareer={profile?.playing_career ?? ''}
            initialCoachingSince={profile?.coaching_since ?? null}
            initialCertifications={profile?.certifications ?? []}
            initialLocation={profile?.location ?? ''}
            initialTwitter={profile?.social_twitter ?? ''}
            initialInstagram={profile?.social_instagram ?? ''}
            initialLinkedin={profile?.social_linkedin ?? ''}
          />
        )}

        {!isCoach && myClips.length > 0 && (
          <div>
            <p className="text-[13px] text-[#3D5166] mb-3 tracking-wider" style={oswald}>Your Clips</p>
            <div className="bg-white rounded-xl border border-[#DDE4ED] divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
              {myClips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F0F4F8] transition-colors"
                >
                  <span className="text-sm text-[#0F1F33] truncate">{clip.title}</span>
                  <span className="text-xs text-[#3D5166] shrink-0 ml-3">{fmtDate(clip.created_at)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!isCoach && myClips.length === 0 && (
          <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-[#3D5166]">No clips yet — your coach will upload them.</p>
          </div>
        )}

        {isCoach && (
          <div className="bg-white border border-[#DDE4ED] rounded-xl p-5 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm text-[#0F1F33]" style={oswald}>Manage Roster</p>
              <p className="text-xs text-[#3D5166] mt-0.5">View teams, players, and clips</p>
            </div>
            <Link href="/dashboard" className="text-xs text-[#C8102E] hover:text-[#9E0E24] transition-colors" style={oswald}>
              Go to Dashboard →
            </Link>
          </div>
        )}

        <div className="border border-[#C8102E]/20 rounded-xl overflow-hidden">
          <div className="p-5">
            <p className="text-sm text-[#0F1F33] mb-1" style={oswald}>Delete Account</p>
            <p className="text-xs text-[#3D5166] mb-4">Permanently removes your account and all associated data. Cannot be undone.</p>
            <DeleteAccountButton />
          </div>
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
