'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { savePhaseChecklist } from '@/app/actions/clips'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Rating     = 'good' | 'needs_work' | 'critical' | null
type SaveState  = 'idle' | 'saving' | 'done'

const PHASES = [
  { name: 'Windup / Rocker Step',      desc: 'Balance, tempo, hip hinge initiation' },
  { name: 'Stride / Leg Lift',          desc: 'Height, direction, hip load timing' },
  { name: 'Foot Strike / Hip Load',     desc: 'Stride length, landing angle, hip-glute engagement' },
  { name: 'Arm Path / Elbow Elevation', desc: 'Arm action timing, elbow height, external rotation' },
  { name: 'Hip-Shoulder Separation',    desc: 'Rotation sequence, energy transfer from lower half' },
  { name: 'Release Point',              desc: 'Consistency, height, extension toward plate' },
  { name: 'Follow Through / Decel',     desc: 'Arm deceleration, fielding position, balance' },
]

const RATINGS: { value: Rating; label: string; color: string }[] = [
  { value: 'good',       label: 'Good',       color: '#16a34a' },
  { value: 'needs_work', label: 'Needs Work', color: '#d97706' },
  { value: 'critical',   label: 'Focus',      color: '#E8102A' },
]

interface PhaseRow {
  name: string
  rating: Rating
  note: string
}

function initPhases(initial: PhaseRow[] | null): PhaseRow[] {
  if (initial && initial.length > 0) return initial
  return PHASES.map(p => ({ name: p.name, rating: null, note: '' }))
}

export default function PhaseChecklist({
  clipId,
  role,
  initial,
}: {
  clipId: string
  role: 'coach' | 'player'
  initial: PhaseRow[] | null
}) {
  const [phases,    setPhases]    = useState<PhaseRow[]>(() => initPhases(initial))
  const [saveState, setSaveState] = useState<SaveState>(initial ? 'done' : 'idle')
  const [error,     setError]     = useState<string | null>(null)
  const isCoach = role === 'coach'

  function setRating(i: number, rating: Rating) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, rating } : p))
    setSaveState('idle')
  }

  function setNote(i: number, note: string) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, note } : p))
    setSaveState('idle')
  }

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    const result = await savePhaseChecklist(clipId, phases)
    if (result?.error) {
      setSaveState('idle')
      setError(result.error)
    } else {
      setSaveState('done')
    }
  }

  const ratedCount    = phases.filter(p => p.rating !== null).length
  const criticalCount = phases.filter(p => p.rating === 'critical').length
  const needsCount    = phases.filter(p => p.rating === 'needs_work').length
  const goodCount     = phases.filter(p => p.rating === 'good').length

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      {ratedCount > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="h-px" style={{ background: 'linear-gradient(to right, #16a34a, #d97706, #E8102A)' }} />
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            {[
              { label: 'Good',       count: goodCount,    color: '#16a34a' },
              { label: 'Needs Work', count: needsCount,   color: '#d97706' },
              { label: 'Focus',      count: criticalCount, color: '#E8102A' },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className="text-xl tracking-tight" style={{ ...os, color: s.color }}>{s.count}</p>
                <p className="text-[10px] text-slate-400 mt-0.5" style={os}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase rows */}
      <div className="space-y-2">
        {phases.map((phase, i) => {
          const phaseDef = PHASES[i]
          const ratingObj = RATINGS.find(r => r.value === phase.rating)
          const borderColor = phase.rating === 'critical'   ? 'rgba(232,16,42,0.35)'
                            : phase.rating === 'needs_work' ? 'rgba(217,119,6,0.3)'
                            : phase.rating === 'good'       ? 'rgba(22,163,74,0.3)'
                            : '#e2e8f0'
          return (
            <div
              key={phase.name}
              className="rounded-xl overflow-hidden transition-colors"
              style={{ background: '#ffffff', border: `1px solid ${borderColor}` }}
            >
              <div className="px-4 pt-3 pb-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 tracking-tight" style={os}>{phase.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{phaseDef.desc}</p>
                  </div>

                  {isCoach ? (
                    <div className="flex gap-1.5 shrink-0">
                      {RATINGS.map(r => {
                        const active = phase.rating === r.value
                        return (
                          <button
                            key={r.value}
                            onClick={() => setRating(i, active ? null : r.value)}
                            className="text-[10px] px-2 py-1 rounded transition-all active:scale-95"
                            style={{
                              ...os,
                              border: `1px solid ${active ? r.color : '#e2e8f0'}`,
                              background: active ? r.color + '18' : 'transparent',
                              color: active ? r.color : '#94a3b8',
                            }}
                          >
                            {r.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    ratingObj && (
                      <span
                        className="text-[10px] px-2 py-1 rounded shrink-0"
                        style={{ ...os, background: ratingObj.color + '18', color: ratingObj.color }}
                      >
                        {ratingObj.label}
                      </span>
                    )
                  )}
                </div>

                {isCoach && (
                  <input
                    type="text"
                    value={phase.note}
                    onChange={e => setNote(i, e.target.value)}
                    placeholder="Add a note…"
                    className="mt-2 w-full text-xs rounded-md px-3 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300 transition-all"
                    style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
                  />
                )}
                {!isCoach && phase.note && (
                  <p className="mt-2 text-xs text-slate-500 italic">{phase.note}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Save row */}
      {isCoach && (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {saveState === 'done'
                ? 'Saved'
                : ratedCount > 0
                ? `${ratedCount} / ${PHASES.length} phases rated`
                : 'Rate each phase to build the report'}
            </span>

            <motion.button
              onClick={handleSave}
              disabled={ratedCount === 0 || saveState === 'saving'}
              className="relative overflow-hidden text-xs text-white rounded-lg transition-all disabled:opacity-40 min-w-[120px] h-9 flex items-center justify-center"
              style={{ ...os, background: saveState === 'done' ? '#16a34a' : '#E8102A' }}
              whileTap={{ scale: 0.95 }}
              animate={{
                scale: saveState === 'saving' ? 0.97 : 1,
                background: saveState === 'done' ? '#16a34a' : '#E8102A',
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {saveState === 'idle' && (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    Save Checklist
                  </motion.span>
                )}
                {saveState === 'saving' && (
                  <motion.span
                    key="saving"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </motion.span>
                )}
                {saveState === 'done' && (
                  <motion.span
                    key="done"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
          {error && <p className="text-xs text-[#E8102A] mt-2">{error}</p>}
        </div>
      )}
    </div>
  )
}
