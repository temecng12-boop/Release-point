'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { savePhaseChecklist } from '@/app/actions/clips'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Rating     = 'good' | 'needs_work' | 'critical' | null
type SaveState  = 'idle' | 'saving' | 'done'

const PITCHING_PHASES = [
  { name: 'Windup / Rocker Step',      desc: 'Balance, tempo, hip hinge initiation' },
  { name: 'Stride / Leg Lift',          desc: 'Height, direction, hip load timing' },
  { name: 'Foot Strike / Hip Load',     desc: 'Stride length, landing angle, hip-glute engagement' },
  { name: 'Arm Path / Elbow Elevation', desc: 'Arm action timing, elbow height, external rotation' },
  { name: 'Hip-Shoulder Separation',    desc: 'Rotation sequence, energy transfer from lower half' },
  { name: 'Release Point',              desc: 'Consistency, height, extension toward plate' },
  { name: 'Follow Through / Decel',     desc: 'Arm deceleration, fielding position, balance' },
]

const HITTING_PHASES = [
  {
    name: 'Stance & Athletic Posture',
    desc: 'Feet shoulder-width or slightly wider. Knees flexed, slight hip hinge forward — not upright, not crouched. Weight 50/50 or slightly back. Spine angle consistent. Both eyes level toward pitcher.',
  },
  {
    name: 'Grip & Hand Setup',
    desc: 'Knocking knuckles aligned (or close). Grip pressure light-to-medium — tension kills bat speed. Hands 3–6" from body, typically between armpit and shoulder height. Bat angle sets the attack plane before the pitch arrives.',
  },
  {
    name: 'Load & Timing Trigger',
    desc: 'Weight shifts into back hip — coil, not sway (hip stays over back foot). Hand trigger moves hands back slightly. Back hip hinges and loads, creating hip-to-shoulder separation window. Rhythm/tempo: smooth, not jerky. The load is the battery charge.',
  },
  {
    name: 'Stride & Front Foot Landing',
    desc: 'Stride typically 4–8" for elite hitters. Direction straight to pitcher or slightly closed. Front foot lands SOFT — toe touches first, controlled. No stomping, no lunging. The stride is about timing, not power. Foot lands before committing to swing.',
  },
  {
    name: 'Heel Drop (Swing Commitment)',
    desc: 'Front heel planting is the point of no return — it fires the kinetic chain. Timing here defines everything. Early heel drop = early commitment, easy to fool. Late heel drop = covers more pitches. Front foot angle at landing: slightly closed (in) is generally strongest for rotation.',
  },
  {
    name: 'Hip Drive & Clearance',
    desc: 'Back hip drives forward and rotates toward pitcher — not just sideways. Back heel rises as back hip fires, indicating ground force transfer. Hips clear BEFORE shoulders open. Pelvis fully rotates around a fixed spine axis. A hitter who rotates with their shoulders only loses the entire lower-half advantage.',
  },
  {
    name: 'Hip-Shoulder Separation',
    desc: 'Hips fire first, shoulders stay closed as long as possible. This stretch-shortening gap is where elite bat speed is generated — the rubber band effect. Hands stay back while hips open. The narrower this window gets, the less torque available. Bonds/Trout/Soto all show exceptional separation.',
  },
  {
    name: 'Bat Path & Attack Angle',
    desc: 'Barrel stays above the hands through the swing plane. Attack angle should match the downward trajectory of the pitch: slightly upward, typically 5–15°. This puts the barrel on plane longest. An uppercut (too steep) misses inside the zone. A chopping path (down) creates weak ground balls. Knob leads, barrel trails — never casting.',
  },
  {
    name: 'Contact Point & Barrel Alignment',
    desc: 'Contact depth: pull side slightly out front, middle/oppo deeper in zone. Front shoulder stays closed through contact — early shoulder opens the path. Head down, eyes tracking ball into contact. Palm-up / palm-down hand orientation at impact. Barrel perpendicular to the flight path of the pitch.',
  },
  {
    name: 'Extension Through Contact',
    desc: 'Swing does not stop at the ball — extension happens through and past contact. Arms extend toward the pitcher after contact. This is what separates hard contact from stabs. Extension is the proof that the kinetic chain stayed connected all the way through the zone.',
  },
  {
    name: 'Follow-Through & Finish',
    desc: 'Full rotation: belly button faces pitcher at finish. Hands finish high (over lead shoulder for most hitters). Weight transfers fully onto front side — back toe is all that remains. Spine angle maintained — no collapsing or standing up through the swing. Balance at finish indicates controlled aggression.',
  },
  {
    name: 'Head & Eye Tracking',
    desc: 'Head stays as still as possible throughout — excessive head movement causes mis-hits. Eyes pick up pitch at release, track through the zone to contact. Head should not pull out before contact. Hitters who cheat their eyes early lose the ability to read spin and adjust. The eyes are the first thing to evaluate on swing issues.',
  },
]

const RATINGS: { value: Rating; label: string; color: string }[] = [
  { value: 'good',       label: 'Good',       color: '#16a34a' },
  { value: 'needs_work', label: 'Needs Work', color: '#d97706' },
  { value: 'critical',   label: 'Focus',      color: '#C8031E' },
]

interface PhaseRow {
  name: string
  rating: Rating
  note: string
}

function initPhases(initial: PhaseRow[] | null, isPitcher: boolean): PhaseRow[] {
  if (initial && initial.length > 0) return initial
  const source = isPitcher ? PITCHING_PHASES : HITTING_PHASES
  return source.map(p => ({ name: p.name, rating: null, note: '' }))
}

export default function PhaseChecklist({
  clipId,
  role,
  initial,
  isPitcher,
}: {
  clipId: string
  role: 'coach' | 'player'
  initial: PhaseRow[] | null
  isPitcher: boolean
}) {
  const [phases,    setPhases]    = useState<PhaseRow[]>(() => initPhases(initial, isPitcher))
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
          <div className="h-px" style={{ background: 'linear-gradient(to right, #16a34a, #d97706, #C8031E)' }} />
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            {[
              { label: 'Good',       count: goodCount,    color: '#16a34a' },
              { label: 'Needs Work', count: needsCount,   color: '#d97706' },
              { label: 'Focus',      count: criticalCount, color: '#C8031E' },
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
          const phaseDef = (isPitcher ? PITCHING_PHASES : HITTING_PHASES)[i]
          const ratingObj = RATINGS.find(r => r.value === phase.rating)
          const borderColor = phase.rating === 'critical'   ? 'rgba(200,3,30,0.35)'
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
                            className="text-[10px] px-2 py-1 rounded transition-all active:scale-95 max-sm:min-h-11 max-sm:min-w-11"
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
                    className="mt-2 w-full text-xs rounded-md px-3 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300 transition-all max-sm:min-h-11"
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
                ? `${ratedCount} / ${(isPitcher ? PITCHING_PHASES : HITTING_PHASES).length} phases rated`
                : 'Rate each phase to build the report'}
            </span>

            <motion.button
              onClick={handleSave}
              disabled={ratedCount === 0 || saveState === 'saving'}
              className="relative overflow-hidden text-xs text-white rounded-lg transition-all disabled:opacity-40 min-w-[120px] h-9 flex items-center justify-center max-sm:h-11"
              style={{ ...os, background: saveState === 'done' ? '#16a34a' : '#C8031E' }}
              whileTap={{ scale: 0.95 }}
              animate={{
                scale: saveState === 'saving' ? 0.97 : 1,
                background: saveState === 'done' ? '#16a34a' : '#C8031E',
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
          {error && <p className="text-xs text-[#C8031E] mt-2">{error}</p>}
        </div>
      )}
    </div>
  )
}
