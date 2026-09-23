'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
type Position = 'pitcher' | 'hitter'

const CARDS: { value: Position; label: string; sub: string; points: string[] }[] = [
  {
    value: 'pitcher',
    label: 'Pitcher',
    sub: 'I take the mound',
    points: ['Fastball & breaking ball mechanics', 'Rapsodo spin rate & axis analysis', 'Release point & arm path tracking'],
  },
  {
    value: 'hitter',
    label: 'Hitter',
    sub: 'I step in the box',
    points: ['Swing path & contact point', 'Hip rotation & load mechanics', 'Bat speed & approach analysis'],
  },
]

export default function PositionPicker({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [selected, setSelected] = useState<Position | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleContinue() {
    if (!selected || !playerId) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('players').update({ position: selected }).eq('id', playerId)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      {/* Minimal nav */}
      <header className="flex items-center justify-center h-14 border-b border-[#DDE4ED]" style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}>
        <div className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-sm tracking-widest text-[#1C2E4A]" style={oswald}>Release Point</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          {playerName && (
            <p className="text-xs text-[#C8102E] tracking-widest text-center mb-4" style={oswald}>
              Welcome, {playerName}
            </p>
          )}
          <h1 className="text-5xl sm:text-6xl md:text-7xl text-[#0F1F33] text-center mb-3 leading-[0.95]" style={oswald}>
            Pitcher or<br />Hitter?
          </h1>
          <p className="text-sm text-[#3D5166] text-center mb-12">
            This helps your coach and the AI give you relevant feedback.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-10">
            {CARDS.map((card) => {
              const active = selected === card.value
              return (
                <button
                  key={card.value}
                  onClick={() => setSelected(card.value)}
                  className="text-left rounded-xl p-7 transition-all focus:outline-none relative overflow-hidden"
                  style={{
                    backgroundColor: active ? '#FFFFFF' : '#FFFFFF',
                    border: `2px solid ${active ? '#C8102E' : '#DDE4ED'}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  {active && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#C8102E]" />
                  )}
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h2 className="text-2xl text-[#0F1F33] leading-none mb-1" style={oswald}>{card.label}</h2>
                      <p className="text-xs text-[#3D5166]">{card.sub}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-colors ${active ? 'border-[#C8102E] bg-[#C8102E]' : 'border-[#DDE4ED]'}`}>
                      {active && <span className="text-white text-[10px]">✓</span>}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {card.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-xs text-[#456080]">
                        <span className={`w-1 h-1 rounded-full shrink-0 ${active ? 'bg-[#C8102E]' : 'bg-[#DDE4ED]'}`} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleContinue}
              disabled={!selected || loading}
              className="px-12 py-4 rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                ...oswald,
                backgroundColor: selected ? '#C8102E' : '#DDE4ED',
                color: selected ? '#FFFFFF' : '#3D5166',
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
