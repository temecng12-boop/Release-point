'use client'

import { useState } from 'react'
import { recordConsent } from '@/app/actions/guardian'
import { runAction } from '@/lib/action-result'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function ConsentForm({ playerId }: { playerId: string }) {
  const [agreed, setAgreed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On success the server action redirects to /guardian; it only returns on failure.
  async function handleConsent() {
    if (!agreed) return
    setPending(true)
    setError(null)
    const result = await runAction(() => recordConsent(playerId))
    if (!result.ok) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3 cursor-pointer" onClick={() => setAgreed(v => !v)}>
        <div
          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            agreed ? 'bg-[#C8102E] border-[#C8102E]' : 'border-[#DDE4ED] hover:border-[#3D5166]'
          }`}
        >
          {agreed && <span className="text-white text-[10px] leading-none">✓</span>}
        </div>
        <span className="text-sm text-[#456080] leading-relaxed">
          I am the parent or legal guardian of this player and I consent to video storage as described above.
        </span>
      </label>

      {error && <p role="alert" className="text-sm text-[#C8102E]">{error}</p>}

      <button
        onClick={handleConsent}
        disabled={!agreed || pending}
        className="w-full bg-[#C8102E] hover:bg-[#A50D26] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={oswald}
      >
        {pending ? 'Recording Consent…' : 'I Consent. Continue'}
      </button>
    </div>
  )
}
