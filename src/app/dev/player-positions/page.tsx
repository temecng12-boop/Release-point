'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import PlayerSettingsForm from '@/app/player-settings/player-settings-form'
import { parsePositionsInput, type PlayerPosition } from '@/lib/positions'

const KEY = 'dev-player-positions'
const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function loadPositions(): PlayerPosition[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return ['pitcher']
    const parsed = parsePositionsInput(JSON.parse(raw) as unknown)
    return parsed.ok ? parsed.positions : ['pitcher']
  } catch {
    return ['pitcher']
  }
}

function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-end gap-3 px-5 min-h-14 bg-white border-b border-slate-200">
        <Link
          href="/dev/player-positions?view=settings"
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors max-sm:min-h-11 max-sm:min-w-11"
          style={os}
        >
          My Profile
        </Link>
      </header>
      <main className="max-w-4xl mx-auto px-5 py-8">
        <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 px-4 sm:px-7 py-6">
          <p className="text-[11px] text-slate-500 tracking-[0.3em] mb-1" style={os}>Welcome Back</p>
          <h1 className="text-2xl text-slate-950" style={os}>Jordan Reyes</h1>
          <Link
            href="/dev/player-positions?view=settings"
            className="inline-flex items-center justify-center min-h-11 mt-3 px-4 rounded-lg border border-[#e2e8f0] text-sm text-slate-700"
            style={os}
          >
            My Profile
          </Link>
        </div>
      </main>
    </div>
  )
}

function Settings() {
  const [positions, setPositions] = useState<PlayerPosition[]>(['pitcher'])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setPositions(loadPositions())
    setReady(true)
  }, [])

  const player = useMemo(() => ({
    id: '00000000-0000-4000-8000-000000000001',
    full_name: 'Jordan Reyes',
    height: null,
    weight: null,
    high_school: null,
    travel_team: null,
    graduation_year: null,
    throws: null,
    bats: null,
    college_interests: null,
    college_offers: null,
    showcases: null,
    career_stats: null,
    age_group: 'High School',
    position: 'pitcher',
    positions,
  }), [positions])

  if (!ready) return null

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <main className="max-w-2xl mx-auto px-5 py-8">
        <h1 className="text-2xl text-[#0F1F33] mb-6" style={os}>My Profile</h1>
        <PlayerSettingsForm
          key={positions.join(',')}
          player={player}
          onSave={async (data) => {
            sessionStorage.setItem(KEY, JSON.stringify(data.positions ?? []))
            return { success: true }
          }}
        />
      </main>
    </div>
  )
}

function Shot() {
  const view = useSearchParams().get('view')
  return view === 'settings' ? <Settings /> : <Home />
}

export default function DevPlayerPositionsPage() {
  return (
    <Suspense>
      <Shot />
    </Suspense>
  )
}
