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
                    <span className="text-xs text-[#3D5166] flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a5 5 0 00-5 5c0 3.5 5 11 5 11s5-7.5 5-11A5 5 0 008 0zm0 7.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
                      {profile.location}
                    </span>
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
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
                    {profile.college}
                  </span>
                )}
                {profile?.playing_career && (
                  <span className="text-xs bg-[#EEF2F7] text-[#456080] px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4.5 9.5C7 8 9 7.5 12 7.5s5 .5 7.5 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M4.5 14.5C7 16 9 16.5 12 16.5s5-.5 7.5-2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="1" strokeOpacity=".3"/></svg>
                    {profile.playing_career}
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
                {profile.social_twitter && (
                  <span className="text-xs text-[#3D5166] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.262 5.636 5.902-5.636zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    {profile.social_twitter}
                  </span>
                )}
                {profile.social_instagram && (
                  <span className="text-xs text-[#3D5166] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    {profile.social_instagram}
                  </span>
                )}
                {profile.social_linkedin && (
                  <span className="text-xs text-[#3D5166] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    {profile.social_linkedin}
                  </span>
                )}
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
