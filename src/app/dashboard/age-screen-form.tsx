'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { submitAgeAnswer, type AgeAnswerState } from '@/app/actions/age'
import BirthFields from '@/components/birth-fields'
import Under13Stop from '@/components/under13-stop'

// The age screen: first sign-in for a coach-invited player (/onboarding/age),
// and the one-time confirm at the top of a coachless player's dashboard.
// Moves on only after the server stored the answer; an under-13 answer shows
// the stop message (the server signed them out and set the stop cookie).
export default function AgeScreenForm({ next, compact = false }: { next?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<AgeAnswerState, FormData>(submitAgeAnswer, undefined)
  const router = useRouter()

  useEffect(() => {
    if (!state?.done) return
    if (next) router.replace(next)
    else router.refresh()
  }, [state, next, router])

  if (state?.stopped) return <Under13Stop compact={compact} />

  return (
    <form action={action} className={compact ? 'space-y-2' : 'space-y-4'} data-testid="age-screen-form">
      <BirthFields legendClassName={compact ? 'block text-xs font-medium text-amber-900 mb-1.5' : undefined} />
      {state?.error && <p role="alert" className="text-xs text-[#C8102E]">{state.error}</p>}
      <button type="submit" disabled={pending || !!state?.done}
        className={compact
          ? 'text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50 min-h-11'
          : 'w-full bg-slate-950 hover:bg-slate-800 text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-40 min-h-11'}>
        {pending || state?.done ? 'Saving…' : 'Continue'}
      </button>
    </form>
  )
}
