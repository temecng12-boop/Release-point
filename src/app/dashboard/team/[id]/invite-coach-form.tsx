'use client'

import { useActionState, useEffect, useRef } from 'react'
import { inviteAssistantCoach } from '@/app/actions/invite-coach'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputCls = 'w-full bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] max-sm:min-h-11'

export default function InviteCoachForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState(inviteAssistantCoach, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid #EEF2F7' }}>
      <p className="text-[10px] tracking-[0.25em] text-[#456080] mb-3" style={os}>Invite New Coach</p>
      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="team_id" value={teamId} />
        <input
          type="text"
          name="coach_name"
          placeholder="Name (optional)"
          className={inputCls}
        />
        <div className="flex gap-2">
          <input
            type="email"
            name="coach_email"
            placeholder="Email address"
            required
            className={`${inputCls} flex-1`}
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-[#C8102E] hover:bg-red-700 text-white rounded-md px-4 py-2 text-xs transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 max-sm:min-h-11"
            style={os}
          >
            {pending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
        {state?.error && <p className="text-xs text-[#C8102E]">{state.error}</p>}
        {state?.success && <p className="text-xs text-green-700">{state.success}</p>}
        <p className="text-[10px] text-[#8096AE]">
          They&apos;ll get an email to create their account and will automatically join this team as an assistant coach.
        </p>
      </form>
    </div>
  )
}
