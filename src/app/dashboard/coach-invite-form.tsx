'use client'

import { useActionState, useEffect, useRef } from 'react'
import { inviteCoach } from '@/app/actions/coach-invites'
import InviteLinkBox from './invite-link-box'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]'

export default function CoachInviteForm() {
  const [state, action, pending] = useActionState(inviteCoach, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={oswald}>Coach Name</label>
          <input type="text" name="full_name" placeholder="Full name" required className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={oswald}>Coach Email</label>
          <input type="email" name="coach_email" placeholder="coach@example.com" required className={inputClass} />
        </div>
      </div>

      {state?.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <span className="text-[#C8102E] text-sm">✕</span>
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      {state?.success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <span className="text-green-600 text-sm">✓</span>
          <p className="text-sm text-green-700">{state.success}</p>
        </div>
      )}
      {state?.inviteUrl && <InviteLinkBox inviteUrl={state.inviteUrl} />}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-[#1C3A5C] hover:bg-[#223F63] text-white rounded-md px-5 py-2 text-sm transition-colors disabled:opacity-50"
        style={oswald}
      >
        {pending ? 'Sending…' : 'Send Coach Invite'}
      </button>
    </form>
  )
}
