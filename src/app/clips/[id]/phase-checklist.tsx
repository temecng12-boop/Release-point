'use client'

import { useState } from 'react'
import { savePhaseChecklist } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Rating = 'good' | 'needs_work' | 'critical' | null

const PHASES = [
  { name: 'Windup / Rocker Step',     desc: 'Balance, tempo, hip hinge initiation' },
  { name: 'Stride / Leg Lift',         desc: 'Height, direction, hip load timing' },
  { name: 'Foot Strike / Hip Load',    desc: 'Stride length, landing angle, hip-glute engagement' },
  { name: 'Arm Path / Elbow Elevation', desc: 'Arm action timing, elbow height, external rotation' },
  { name: 'Hip-Shoulder Separation',   desc: 'Rotation sequence, energy transfer from lower half' },
  { name: 'Release Point',             desc: 'Consistency, height, extension toward plate' },
  { name: 'Follow Through / Decel',    desc: 'Arm deceleration, fielding position, balance' },
]

const RATINGS: { value: Rating; label: string; color: string }[] = [
  { value: 'good',       label: 'Good',        color: '#22c55e' },
  { value: 'needs_work', label: 'Needs Work',  color: '#f59e0b' },
  { value: 'critical',   label: 'Focus',       color: '#C8102E' },
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
  const [phases, setPhases] = useState<PhaseRow[]>(() => initPhases(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(!!initial)
  const [error, setError]   = useState<string | null>(null)
  const isCoach = role === 'coach'

  function setRating(i: number, rating: Rating) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, rating } : p))
    setSaved(false)
  }

  function setNote(i: number, note: string) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, note } : p))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await savePhaseChecklist(clipId, phases)
    setSaving(false)
    if (result?.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  const ratedCount = phases.filter(p => p.rating !== null).length
  const criticalPhases = phases.filter(p => p.rating === 'critical')
  const needsWorkPhases = phases.filter(p => p.rating === 'needs_work')

  return (
    <div className="space-y-4">
      {/* Summary strip (if rated) */}
      {ratedCount > 0 && (
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-gradient-to-r from-[#22c55e] via-[#f59e0b] to-[#C8102E]" />
          <div className="grid grid-cols-3 divide-x divide-[#DDE4ED] px-1">
            {[
              { label: 'Good', count: phases.filter(p => p.rating === 'good').length, color: '#22c55e' },
              { label: 'Needs Work', count: needsWorkPhases.length, color: '#f59e0b' },
              { label: 'Focus', count: criticalPhases.length, color: '#C8102E' },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className="text-xl" style={{ ...oswald, color: s.color }}>{s.count}</p>
                <p className="text-[10px] text-[#3D5166] mt-0.5" style={oswald}>{s.label}</p>
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
          return (
            <div
              key={phase.name}
              className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm"
              style={phase.rating === 'critical' ? { borderColor: '#fca5a5' } :
                     phase.rating === 'needs_work' ? { borderColor: '#fde68a' } :
                     phase.rating === 'good' ? { borderColor: '#bbf7d0' } : {}}
            >
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0F1F33]" style={oswald}>{phase.name}</p>
                    <p className="text-[11px] text-[#3D5166] mt-0.5">{phaseDef.desc}</p>
                  </div>

                  {/* Rating buttons (coach only) */}
                  {isCoach ? (
                    <div className="flex gap-1.5 shrink-0">
                      {RATINGS.map(r => (
                        <button
                          key={r.value}
                          onClick={() => setRating(i, phase.rating === r.value ? null : r.value)}
                          className="text-[10px] px-2 py-1 rounded border transition-all"
                          style={{
                            borderColor: phase.rating === r.value ? r.color : '#DDE4ED',
                            backgroundColor: phase.rating === r.value ? r.color + '15' : 'transparent',
                            color: phase.rating === r.value ? r.color : '#456080',
                            ...oswald,
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    ratingObj && (
                      <span
                        className="text-[10px] px-2 py-1 rounded shrink-0"
                        style={{ ...oswald, backgroundColor: ratingObj.color + '15', color: ratingObj.color }}
                      >
                        {ratingObj.label}
                      </span>
                    )
                  )}
                </div>

                {/* Note field */}
                {isCoach && (
                  <input
                    type="text"
                    value={phase.note}
                    onChange={e => setNote(i, e.target.value)}
                    placeholder="Add a note…"
                    className="mt-2 w-full text-xs bg-[#F8FAFC] border border-[#DDE4ED] rounded-md px-3 py-1.5 text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]"
                  />
                )}
                {!isCoach && phase.note && (
                  <p className="mt-2 text-xs text-[#456080] italic">{phase.note}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Save button (coach only) */}
      {isCoach && (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#3D5166]">
              {saved ? '✓ Saved' : ratedCount > 0 ? `${ratedCount} / ${PHASES.length} phases rated` : 'Rate each phase to build the report'}
            </span>
            <button
              onClick={handleSave}
              disabled={saving || ratedCount === 0}
              className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
              style={oswald}
            >
              {saving ? 'Saving…' : 'Save Checklist'}
            </button>
          </div>
          {error && <p className="text-xs text-[#C8102E] mt-2">{error}</p>}
        </div>
      )}
    </div>
  )
}
