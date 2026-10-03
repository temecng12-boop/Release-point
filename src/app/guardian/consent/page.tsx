import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { linkGuardianAccount, resolveGuardianForPlayer, consentPath } from '@/lib/guardian-invite'
import ConsentForm from './consent-form'
import Logo from '@/components/Logo'
import SignOutForm from '@/components/sign-out-form'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export const dynamic = 'force-dynamic'

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ player_id?: string }> }) {
  const { player_id } = await searchParams
  if (!player_id) redirect('/auth/login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(consentPath(player_id))}`)

  // Works before the account has the guardian role: the guardian on file for
  // this player is matched server-side (linked user_id, or the same verified
  // email), then the account is linked and, if it is an empty 'player'
  // profile, becomes 'guardian' (migration 029). Anyone else sees a notice.
  const match = await resolveGuardianForPlayer(supabaseAdmin, user, player_id)
  if (!match.ok) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-10">
            <Logo size="sm" />
          </div>
          <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8 space-y-4">
              <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Guardian Consent</p>
              <p role="alert" className="text-sm text-[#3D5166]">
                {match.reason === 'failed'
                  ? 'We couldn\'t load this consent request. Please try again in a moment.'
                  : `This consent link isn't for the account you're signed in with (${user.email ?? 'no email'}). Sign in with the email address the coach entered for you.`}
              </p>
              {match.reason !== 'failed' && (
                <SignOutForm>
                  <button type="submit" className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors max-sm:min-h-11" style={oswald}>
                    Sign out and switch account →
                  </button>
                </SignOutForm>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  // A failed link is retried by recordConsent, which reports any error.
  await linkGuardianAccount(supabaseAdmin, user, match.guardian)
  const player = match.player

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-10">
          <Logo size="sm" />
        </div>

        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-8">
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-4" style={oswald}>Guardian Consent</p>
            <h1 className="text-2xl text-[#0F1F33] mb-2" style={oswald}>Video Storage Consent</h1>
            <p className="text-sm text-[#3D5166] mb-8">
              For <span className="text-[#456080]">{player.full_name}</span>
              {player.age_group ? ` · ${player.age_group}` : ''}
            </p>

            <div className="bg-[#F5F7FA] border border-[#DDE4ED] rounded-lg p-5 mb-8 space-y-3">
              <p className="text-xs text-[#456080] leading-relaxed">
                By consenting, you authorize Release Point to store and display video footage of your player for coaching and mechanics analysis purposes.
              </p>
              <p className="text-xs text-[#456080] leading-relaxed">
                Video is accessible only to you, the player, and the coach who invited you. It is never shared publicly. You may request deletion at any time by contacting your coach.
              </p>
              <p className="text-xs text-[#3D5166] leading-relaxed">
                This consent covers: video recordings, annotations, pitching and hitting metrics, and AI-generated coaching notes attached to this player's profile.
              </p>
            </div>

            <ConsentForm playerId={player_id} />
          </div>
        </div>
      </div>
    </div>
  )
}
