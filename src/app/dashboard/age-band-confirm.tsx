'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setPlayerAgeBand } from '@/app/actions/player'
import { runAction } from '@/lib/action-result'
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from '@/lib/age-band'

// One-tap age band for the coach's own player (RP-041, 037), same look as
// MarkAdultButton. setPlayerAgeBand checks players.coach_id = caller on the
// server. The screen changes only after the server confirmed the save.
const btn = 'text-xs bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 px-3 py-1 rounded-md transition-colors disabled:opacity-50 max-sm:min-h-11'

export default function AgeBandConfirm({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [saving, setSaving] = useState<AgeBand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save(band: AgeBand) {
    setSaving(band)
    setError(null)
    const result = await runAction(() => setPlayerAgeBand(playerId, band))
    setSaving(null)
    if (!result.ok) { setError(result.error); return }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={`Confirm ${playerName}'s age`}>
      {AGE_BANDS.map((band) => (
        <button key={band} type="button" disabled={!!saving} className={btn} onClick={() => save(band)}>
          {saving === band ? 'Saving…' : band === '18_plus' ? 'Mark as 18+' : AGE_BAND_LABELS[band]}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-[#C8102E]">{error}</span>}
    </div>
  )
}
