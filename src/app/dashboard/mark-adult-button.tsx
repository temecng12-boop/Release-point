'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setPlayerAdultConfirmed } from '@/app/actions/player'

// Lets the player's coach record that the player is 18 or older (RP-041).
// The server action checks that the caller is allowed to do this.
export default function MarkAdultButton({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function confirm() {
    setSaving(true)
    setError(null)
    const result = await setPlayerAdultConfirmed(playerId, true)
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    setConfirming(false)
    router.refresh()
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 px-3 py-1 rounded-md transition-colors"
      >
        Mark as 18+
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-amber-900">Confirm {playerName} is 18 or older?</span>
      <button
        type="button"
        onClick={confirm}
        disabled={saving}
        className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => { setConfirming(false); setError(null) }}
        disabled={saving}
        className="text-xs text-amber-900 hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-[#C8102E]">{error}</span>}
    </div>
  )
}
