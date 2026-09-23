import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import PlayerSettingsForm from './player-settings-form'
import AvatarUpload from '@/app/profile/avatar-upload'
import AppHeader from '@/components/app-header'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function PlayerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name, avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'coach') redirect('/dashboard')

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('id, full_name, height, weight, high_school, travel_team, graduation_year, throws, bats, college_interests, college_offers, age_group, position')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'My Profile' }]}
        showSignOut
      />

      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex items-center gap-4 mb-6">
          <AvatarUpload
            userId={user.id}
            currentAvatarUrl={(profile as { avatar_url?: string | null })?.avatar_url ?? null}
            displayName={(profile as { full_name?: string | null })?.full_name ?? player?.full_name ?? 'P'}
          />
          <div>
            <h1 className="text-2xl text-[#0F1F33]" style={oswald}>My Profile</h1>
            <p className="text-sm text-[#3D5166] mt-0.5">Keep your profile complete so coaches can see your full picture.</p>
          </div>
        </div>
        <PlayerSettingsForm player={player} />
      </main>
    </div>
  )
}
