'use client'

import { useActionState, useEffect, useRef, useTransition } from 'react'
import { addCoachToTeam, removeCoachFromTeam } from '@/app/actions/team-coaches'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'flex-1 bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]'

interface Coach {
  coach_id: string
  role: string
  profiles: { full_name: string | null; email: string | null } | null
}

export default function AddCoachForm({
  teamId,
  coaches,
  isOrganizer,
}: {
  teamId: string
  coaches: Coach[]
  isOrganizer: boolean
}) {
  const [state, action, pending] = useActionState(addCoachToTeam, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
      <div className="h-1 bg-[#1C3A5C]" />
      <div className="p-5">
        <p className="text-[10px] tracking-[0.3em] text-[#1C3A5C] mb-4" style={oswald}>Coaching Staff</p>

        {/* Current coaches */}
        <div className="space-y-2 mb-5">
          {coaches.map(c => (
            <div key={c.coach_id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm text-[#0F1F33] truncate">{c.profiles?.full_name ?? c.profiles?.email ?? 'Unknown'}</p>
                <p className="text-[11px] text-[#8096AE]" style={oswald}>{c.role}</p>
              </div>
              {isOrganizer && c.role === 'assistant' && (
                <RemoveButton teamId={teamId} coachId={c.coach_id} />
              )}
            </div>
          ))}
        </div>

        {/* Add coach form — organizer only */}
        {isOrganizer && (
          <form ref={formRef} action={action}>
            <input type="hidden" name="team_id" value={teamId} />
            <div className="flex gap-2">
              <input
                type="email"
                name="coach_email"
                placeholder="Assistant coach email"
                required
                className={inputClass}
              />
              <button
                type="submit"
                disabled={pending}
                className="bg-[#1C3A5C] hover:bg-[#223F63] text-white rounded-md px-4 py-2 text-xs transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                style={oswald}
              >
                {pending ? 'Adding…' : 'Add Coach'}
              </button>
            </div>
            {state?.error && (
              <p className="text-xs text-[#C8102E] mt-2">{state.error}</p>
            )}
            {state?.success && (
              <p className="text-xs text-green-700 mt-2">{state.success}</p>
            )}
            <p className="text-[10px] text-[#3D5166] mt-3">
              Assistant coaches can view and manage all players and clips on this team.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

function RemoveButton({ teamId, coachId }: { teamId: string; coachId: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(async () => { await removeCoachFromTeam(teamId, coachId) })}
      disabled={pending}
      className="text-[11px] text-[#8096AE] hover:text-[#C8102E] transition-colors disabled:opacity-50"
      style={oswald}
    >
      {pending ? '…' : 'Remove'}
    </button>
  )
}
