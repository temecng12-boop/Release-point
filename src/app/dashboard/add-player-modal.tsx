'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { invitePlayer } from '@/app/actions/invite'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputCls = 'w-full bg-[#F8FAFC] border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#B0BEC5] focus:outline-none focus:border-[#456080] transition-colors'

const AGE_GROUPS = ['Youth (8–12)', 'Middle School (13–14)', 'High School (15–18)', 'Amateur (18+)', 'Professional']
const MINOR_GROUPS = new Set(['Youth (8–12)', 'Middle School (13–14)'])

export default function AddPlayerModal({
  teamId,
  teams,
}: {
  teamId?: string
  teams?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [ageGroup, setAgeGroup] = useState('')
  const [state, action, pending] = useActionState(invitePlayer, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const isMinor = ISMINOR(ageGroup)

  useEffect(() => {
    if (state?.success) {
      setTimeout(() => {
        setOpen(false)
        formRef.current?.reset()
        setAgeGroup('')
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
            {/* Header */}
            <div className="h-1 bg-[#C8102E]" />
            <div className="px-6 py-5 flex items-center justify-between border-b border-[#F0F4F8]">
              <div>
                <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={os}>Coach</p>
                <h2 className="text-base text-[#0F1F33] leading-tight mt-0.5" style={os}>Add a Player</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form ref={formRef} action={action} className="px-6 py-5 space-y-4">
              {teamId && <input type="hidden" name="team_id" value={teamId} />}

              {/* Name */}
              <div>
                <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Player Name *</label>
                <input type="text" name="full_name" placeholder="First and last name" required className={inputCls} />
              </div>

              {/* Age Group + Position */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Age Group</label>
                  <select
                    name="age_group"
                    value={ageGroup}
                    onChange={e => setAgeGroup(e.target.value)}
                    className={inputCls}
                    style={{ appearance: 'none' }}
                  >
                    <option value="">Select…</option>
                    {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>Position</label>
                  <input type="text" name="position" placeholder="e.g. RHP, SS, C" className={inputCls} />
                </div>
              </div>

              {/* Email — label changes for minors */}
              <div>
                <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>
                  {isMinor ? 'Parent / Guardian Email *' : 'Player Email *'}
                </label>
                <input
                  type="email"
                  name="player_email"
                  placeholder={isMinor ? "Parent's email address" : "Player's email address"}
                  required
                  className={inputCls}
                />
                {isMinor && (
                  <p className="text-[10px] text-[#8096AE] mt-1.5 leading-snug">
                    Player is under 13 — the invite goes to the parent. They sign up and manage their child's account.
                  </p>
                )}
              </div>

              {/* Team checkboxes (when multiple teams available) */}
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

              {/* States */}
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
                {pending ? 'Sending Invite…' : isMinor ? 'Send Parent Invite' : 'Send Player Invite'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function ISMINOR(ageGroup: string) {
  return MINOR_GROUPS.has(ageGroup)
}
