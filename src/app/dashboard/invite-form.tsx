'use client'

import { useActionState } from 'react'
import { invitePlayer } from '@/app/actions/invite'

interface Team { id: string; name: string }
interface Props { teams: Team[] }

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#7A92A8] focus:outline-none focus:border-[#456080]'

export default function InviteForm({ teams }: Props) {
  const [state, action, pending] = useActionState(invitePlayer, undefined)

  return (
    <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
      <div className="h-1 bg-[#C8102E]" />
      <div className="p-5">
        <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-4" style={oswald}>Add Player</p>
        <form action={action} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#7A92A8] mb-1.5 tracking-wide" style={oswald}>Player Name</label>
              <input type="text" name="full_name" placeholder="Full name" required className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] text-[#7A92A8] mb-1.5 tracking-wide" style={oswald}>Player Email</label>
              <input type="email" name="player_email" placeholder="Player's email" required className={inputClass} />
            </div>
          </div>

          {teams.length > 0 && (
            <div>
              <label className="block text-[10px] text-[#7A92A8] mb-1.5 tracking-wide" style={oswald}>Assign to Teams</label>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" name="team_ids" value={t.id} className="accent-[#C8102E]" />
                    <span className="text-xs text-[#456080]">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {state?.error && <p className="text-xs text-[#C8102E]">{state.error}</p>}
          {state?.success && <p className="text-xs text-green-400">{state.success}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-5 py-2 text-sm transition-colors disabled:opacity-50"
            style={oswald}
          >
            {pending ? 'Adding…' : 'Add Player'}
          </button>
        </form>
      </div>
    </div>
  )
}
