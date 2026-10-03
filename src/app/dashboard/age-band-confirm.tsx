'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmMyAgeBand, setPlayerAgeBand } from '@/app/actions/player'
import { runAction } from '@/lib/action-result'
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from '@/lib/consent'

// Age band buttons (RP-041, 035), same look as MarkAdultButton.
//   * coach: one tap records the band for their own player (setPlayerAgeBand
//     checks players.coach_id = caller on the server).
//   * self: a player with no coach confirms their own band once, with a
//     confirm step (only a coach can change it afterwards).
// The screen changes only after the server confirmed the save.
const btn = 'text-xs bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 px-3 py-1 rounded-md transition-colors disabled:opacity-50 max-sm:min-h-11'

export default function AgeBandConfirm(
  props: { mode: 'coach'; playerId: string; playerName: string } | { mode: 'self' },
) {
  const [choice, setChoice] = useState<AgeBand | null>(null)
  const [saving, setSaving] = useState<AgeBand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save(band: AgeBand) {
    setSaving(band)
    setError(null)
    const result = await runAction(() => props.mode === 'coach' ? setPlayerAgeBand(props.playerId, band) : confirmMyAgeBand(band))
    setSaving(null)
    if (!result.ok) { setError(result.error); return }
    setChoice(null)
    router.refresh()
  }

  if (props.mode === 'self' && choice) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-amber-900">
          Confirm you are {choice === 'under_13' ? 'under 13' : choice === '13_17' ? '13 to 17' : '18 or older'}? Only a coach can change it later.
        </span>
        <button type="button" onClick={() => save(choice)} disabled={!!saving}
          className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50 max-sm:min-h-11">
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button type="button" onClick={() => { setChoice(null); setError(null) }} disabled={!!saving}
          className="text-xs text-amber-900 hover:underline max-sm:min-h-11 max-sm:min-w-11">
          Cancel
        </button>
        {error && <span role="alert" className="text-xs text-[#C8102E]">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group"
      aria-label={props.mode === 'coach' ? `Confirm ${props.playerName}'s age` : 'Confirm your age'}>
      {AGE_BANDS.map((band) => (
        <button key={band} type="button" disabled={!!saving} className={btn}
          onClick={() => (props.mode === 'coach' ? save(band) : setChoice(band))}>
          {saving === band ? 'Saving…' : props.mode === 'self' && band === '18_plus' ? "I'm 18 or older" : band === '18_plus' ? 'Mark as 18+' : AGE_BAND_LABELS[band]}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-[#C8102E]">{error}</span>}
    </div>
  )
}
