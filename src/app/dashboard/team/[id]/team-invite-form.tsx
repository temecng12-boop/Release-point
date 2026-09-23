'use client'

import { useActionState, useEffect, useRef } from 'react'
import { invitePlayer } from '@/app/actions/invite'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]'

export default function TeamInviteForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState(invitePlayer, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
      <div className="h-1 bg-[#C8102E]" />
      <div className="p-5">
        <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-4" style={oswald}>Add Player to Roster</p>
        <form ref={formRef} action={action} className="space-y-3">
          <input type="hidden" name="team_id" value={teamId} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={oswald}>Player Name</label>
              <input type="text" name="full_name" placeholder="Player's full name" required className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={oswald}>Guardian Name</label>
              <input type="text" name="guardian_name" placeholder="Parent / guardian name" required className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={oswald}>Guardian Email</label>
            <div className="flex gap-2">
              <input type="email" name="guardian_email" placeholder="Parent / guardian email" required className={inputClass} />
              <button
                type="submit"
                disabled={pending}
                className="bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-5 py-2 text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
                style={oswald}
              >
                {pending ? 'Sending…' : 'Send Invite'}
              </button>
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
        </form>
        <p className="text-[10px] text-[#3D5166] mt-3 leading-relaxed">
          Guardian receives a consent email. Player appears on the roster after they consent.
        </p>
      </div>
    </div>
  )
}
