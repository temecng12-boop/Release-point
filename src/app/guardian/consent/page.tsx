import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConsentForm from './consent-form'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ player_id?: string }> }) {
  const { player_id } = await searchParams
  if (!player_id) redirect('/auth/login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, age_group')
    .eq('id', player_id)
    .single()

  if (!player) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <span>⚾</span>
          <span className="text-sm tracking-[0.15em] text-[#1C2E4A]" style={oswald}>Release Point</span>
        </div>

        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-8">
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-4" style={oswald}>Guardian Consent</p>
            <h1 className="text-2xl text-[#0F1F33] mb-2" style={oswald}>Video Storage Consent</h1>
            <p className="text-sm text-[#7A92A8] mb-8">
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
              <p className="text-xs text-[#7A92A8] leading-relaxed">
                This consent covers: video recordings, annotations, Rapsodo metrics, and AI-generated coaching notes attached to this player's profile.
              </p>
            </div>

            <ConsentForm playerId={player_id} />
          </div>
        </div>
      </div>
    </div>
  )
}
