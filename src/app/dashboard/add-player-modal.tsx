'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { invitePlayer } from '@/app/actions/invite'
import { MONTHS } from '@/lib/birth-months'
import PositionChips from '@/components/position-chips'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputCls = 'w-full bg-[#F8FAFC] border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#B0BEC5] focus:outline-none focus:border-[#456080] transition-colors'

export default function AddPlayerModal({
  teamId,
  teams,
}: {
  teamId?: string
  teams?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(invitePlayer, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      setTimeout(() => {
        setOpen(false)
        formRef.current?.reset()
      }, 1800)
    }
  }, [state?.success])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] px-3 py-2 rounded-lg text-white transition-colors"
        style={{ ...os, background: '#C8102E' }}
      >
        + Add Player
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,31,51,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: '#ffffff', border: '1px solid #DDE4ED' }}
          >
            <div className="h-1 bg-[#C8102E]" />
            <div className="px-6 py-5 flex items-center justify-between border-b border-[#F0F4F8]">
              <div>
                <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={os}>Coach</p>
                <h2 className="text-base text-[#0F1F33] leading-tight mt-0.5" style={os}>Add a Player</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} action={action} className="px-6 py-5 space-y-4">
              {teamId && <input type="hidden" name="team_id" value={teamId} />}

              <div>
                <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Player Name *</label>
                <input type="text" name="full_name" placeholder="First and last name" required className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Player Email *</label>
                <input type="email" name="player_email" placeholder="Player's email address" required className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Birth Month *</label>
                  <select name="birth_month" required defaultValue="" className={inputCls} style={{ appearance: 'none' }}>
                    <option value="" disabled>Month</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Birth Year *</label>
                  <input name="birth_year" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off" placeholder="Year" className={inputCls} />
                </div>
              </div>
              <p className="text-[10px] text-[#3D5166] leading-relaxed">
                Players under 13 can&apos;t be added yet. An under-13 date is refused and nothing is saved.
              </p>

              <PositionChips name="positions" id="add-player-positions" />

              {!teamId && teams && teams.length > 0 && (
                <div>
                  <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Add to Teams</label>
                  <div className="flex flex-wrap gap-2">
                    {teams.map(t => (
                      <label key={t.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" name="team_ids" value={t.id} className="accent-[#C8102E]" />
                        <span className="text-xs text-[#456080]">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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

              <button
                type="submit"
                disabled={pending}
                className="w-full py-2.5 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
                style={{ ...os, background: pending ? '#4A6880' : '#C8102E' }}
              >
                {pending ? 'Sending Invite…' : 'Send Player Invite'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
