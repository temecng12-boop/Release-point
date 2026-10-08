'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePlayerPosition } from '@/app/actions/player'
import Logo from '@/components/Logo'
import PositionChips from '@/components/position-chips'
import type { PlayerPosition } from '@/lib/positions'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function PositionPicker({ playerName }: { playerId: string; playerName: string }) {
  const [selected, setSelected] = useState<PlayerPosition[]>([])
  const [consent, setConsent]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const router = useRouter()

  async function handleContinue() {
    if (!consent) return
    setLoading(true)
    setSaveError(null)
    const result = await savePlayerPosition(selected)
    if (result?.error) {
      setSaveError('Failed to save. Please try again.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <header className="flex items-center justify-center h-14 border-b border-[#DDE4ED]" style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}>
        <Logo size="sm" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          {playerName && (
            <p className="text-xs text-[#C8102E] tracking-widest text-center mb-4" style={oswald}>
              Welcome, {playerName}
            </p>
          )}
          <h1 className="text-5xl sm:text-6xl md:text-7xl text-[#0F1F33] text-center mb-3 leading-[0.95]" style={oswald}>
            What do you<br />play?
          </h1>
          <p className="text-sm text-[#3D5166] text-center mb-12">
            Optional. Tap any that apply — pitcher, hitter, catcher, infield, outfield, or two-way.
          </p>

          <div className="mb-10 flex justify-center">
            <div className="w-full max-w-lg">
              <PositionChips value={selected} onChange={setSelected} id="onboarding-positions" />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-8 p-4 rounded-xl border border-[#DDE4ED] bg-white">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#C8102E] shrink-0 cursor-pointer"
            />
            <span className="text-xs text-[#456080] leading-relaxed">
              I agree to Release Point AI&apos;s use of video, analytics, and coaching data for my pitching or hitting development.
              If I am 13 to 17, I&apos;ve read this with a parent or guardian.
            </span>
          </label>

          {saveError && (
            <p className="text-sm text-[#C8102E] text-center mb-4">{saveError}</p>
          )}

          <div className="flex justify-center">
            <button
              onClick={handleContinue}
              disabled={!consent || loading}
              className="px-12 py-4 rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                ...oswald,
                backgroundColor: consent ? '#C8102E' : '#DDE4ED',
                color: consent ? '#FFFFFF' : '#3D5166',
              }}
            >
              {loading ? 'Saving…' : 'Continue to Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
