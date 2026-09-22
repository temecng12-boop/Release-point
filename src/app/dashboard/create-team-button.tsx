'use client'

import { useState, useEffect } from 'react'
import { useActionState } from 'react'
import { createTeam } from '@/app/actions/team'

const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#7A92A8]'

export default function CreateTeamButton() {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createTeam, undefined)

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state?.success])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
      >
        + New Team
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <h2 className="text-base tracking-widest text-[#0F1F33]" style={oswald}>
              Create Team
            </h2>
            <form action={action} className="space-y-3">
              <div>
                <label className="block text-xs text-[#456080] mb-1">Team Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="e.g. Varsity 2025"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-[#456080] mb-1">Age Group</label>
                <select name="age_group" className={inputClass}>
                  <option value="">— select —</option>
                  {AGE_GROUPS.map((ag) => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                </select>
              </div>

              {state?.error && <p className="text-xs text-[#C8102E]">{state.error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {pending ? 'Creating…' : 'Create Team'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] hover:border-[#456080] rounded-md px-4 py-2 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
