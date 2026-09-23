'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBullpenSession, updateBullpenSession, deleteBullpenSession } from '@/app/actions/bullpen'
import type { PitchBlock } from '@/app/actions/bullpen'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const PITCH_TYPES = ['Fastball', '2-Seam', 'Curveball', 'Slider', 'Cutter', 'Changeup', 'Sinker', 'Splitter']

export type BullpenSession = {
  id: string
  session_date: string | null
  status: string
  pitches: PitchBlock[]
  notes: string | null
  created_at: string
}

type View = 'list' | 'build' | 'run'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function totalThrown(pitches: PitchBlock[]) {
  return pitches.reduce((s, p) => s + (p.thrown ?? 0), 0)
}
function totalTarget(pitches: PitchBlock[]) {
  return pitches.reduce((s, p) => s + p.target, 0)
}

// ── Session list ──────────────────────────────────────────────────────────────
function SessionList({
  sessions,
  onNew,
  onRun,
  onDelete,
}: {
  sessions: BullpenSession[]
  onNew: () => void
  onRun: (s: BullpenSession) => void
  onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
    setConfirmDel(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.25em] text-[#3D5166]" style={oswald}>
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
        <button
          onClick={onNew}
          className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1.5 rounded-md transition-colors"
          style={oswald}
        >
          + New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <div className="w-12 h-12 rounded-xl bg-[#EEF2F7] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#456080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-[#3D5166]">No bullpen sessions yet</p>
          <p className="text-xs text-[#456080] mt-1">Plan a session to structure your next bullpen</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1 pr-1">
          {sessions.map(s => {
            const thrown = totalThrown(s.pitches)
            const target = totalTarget(s.pitches)
            const isComplete = s.status === 'complete'
            return (
              <div
                key={s.id}
                className="bg-[#F5F7FA] border border-[#DDE4ED] rounded-xl px-4 py-3"
              >
                {confirmDel === s.id ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#456080]">Delete this session?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deleting === s.id}
                        className="text-xs bg-[#C8102E] text-white px-2 py-0.5 rounded"
                      >
                        {deleting === s.id ? '…' : 'Delete'}
                      </button>
                      <button onClick={() => setConfirmDel(null)} className="text-xs text-[#456080]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-[#0F1F33]" style={oswald}>{fmtDate(s.session_date)}</span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            ...oswald,
                            backgroundColor: isComplete ? '#dcfce7' : '#EEF2F7',
                            color: isComplete ? '#15803d' : '#456080',
                          }}
                        >
                          {isComplete ? 'Done' : 'Planned'}
                        </span>
                      </div>
                      <p className="text-xs text-[#456080]">
                        {s.pitches.length} pitch {s.pitches.length === 1 ? 'type' : 'types'}
                        {target > 0 ? ` · ${isComplete ? thrown + '/' : ''}${target} pitches` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isComplete && (
                        <button
                          onClick={() => onRun(s)}
                          className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-2.5 py-1 rounded-md transition-colors"
                          style={oswald}
                        >
                          Run
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDel(s.id)}
                        className="text-[#3D5166] hover:text-[#C8102E] transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Build session ─────────────────────────────────────────────────────────────
function BuildSession({
  playerId,
  onBack,
  onCreated,
}: {
  playerId: string
  onBack: () => void
  onCreated: (s: BullpenSession) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]   = useState(today)
  const [notes, setNotes] = useState('')
  const [pitches, setPitches] = useState<PitchBlock[]>([
    { pitch_type: 'Fastball', target: 10, thrown: 0, focus: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function addPitch() {
    const used = new Set(pitches.map(p => p.pitch_type))
    const next = PITCH_TYPES.find(t => !used.has(t)) ?? 'Fastball'
    setPitches(prev => [...prev, { pitch_type: next, target: 10, thrown: 0, focus: '' }])
  }

  function removePitch(i: number) {
    setPitches(prev => prev.filter((_, idx) => idx !== i))
  }

  function updatePitch(i: number, field: keyof PitchBlock, value: string | number) {
    setPitches(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  async function handleSave() {
    if (pitches.length === 0) { setError('Add at least one pitch type'); return }
    setSaving(true)
    setError(null)
    const result = await createBullpenSession({ player_id: playerId, session_date: date || null, pitches, notes })
    setSaving(false)
    if ('error' in result) { setError(result.error ?? 'Failed to save'); return }
    onCreated({
      id: result.id!,
      session_date: date || null,
      status: 'planned',
      pitches,
      notes: notes || null,
      created_at: new Date().toISOString(),
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-[#3D5166] hover:text-[#0F1F33] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-sm text-[#0F1F33]" style={oswald}>New Session</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {/* Date */}
        <div>
          <label className="block text-[10px] tracking-widest text-[#456080] mb-1.5" style={oswald}>Session Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-[#F5F7FA] border border-[#DDE4ED] rounded-lg px-3 py-2 text-sm text-[#0F1F33] focus:outline-none focus:border-[#456080]"
          />
        </div>

        {/* Pitch blocks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] tracking-widest text-[#456080]" style={oswald}>Pitches</label>
            <button onClick={addPitch} className="text-[10px] text-[#1C3A5C] hover:text-[#C8102E] transition-colors" style={oswald}>
              + Add Pitch
            </button>
          </div>

          <div className="space-y-2">
            {pitches.map((p, i) => (
              <div key={i} className="bg-[#F5F7FA] border border-[#DDE4ED] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={p.pitch_type}
                    onChange={e => updatePitch(i, 'pitch_type', e.target.value)}
                    className="flex-1 bg-white border border-[#DDE4ED] rounded-md px-2 py-1.5 text-xs text-[#0F1F33] focus:outline-none focus:border-[#456080]"
                  >
                    {PITCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updatePitch(i, 'target', Math.max(1, p.target - 5))}
                      className="w-6 h-6 rounded bg-white border border-[#DDE4ED] text-[#456080] text-xs flex items-center justify-center"
                    >−</button>
                    <span className="w-8 text-center text-sm text-[#0F1F33]" style={oswald}>{p.target}</span>
                    <button
                      onClick={() => updatePitch(i, 'target', p.target + 5)}
                      className="w-6 h-6 rounded bg-white border border-[#DDE4ED] text-[#456080] text-xs flex items-center justify-center"
                    >+</button>
                  </div>
                  {pitches.length > 1 && (
                    <button onClick={() => removePitch(i)} className="text-[#3D5166] hover:text-[#C8102E] transition-colors shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={p.focus}
                  onChange={e => updatePitch(i, 'focus', e.target.value)}
                  placeholder="Focus cue (e.g. stay tall, drive hip through)"
                  className="w-full bg-white border border-[#DDE4ED] rounded-md px-2.5 py-1.5 text-xs text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[10px] tracking-widest text-[#456080] mb-1.5" style={oswald}>Session Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Warm-up routine, intent, game context…"
            className="w-full bg-[#F5F7FA] border border-[#DDE4ED] rounded-lg px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] resize-none"
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#C8102E] mt-3">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50"
        style={oswald}
      >
        {saving ? 'Saving…' : 'Save Session Plan'}
      </button>
    </div>
  )
}

// ── Run session ───────────────────────────────────────────────────────────────
function RunSession({
  session,
  onBack,
  onComplete,
}: {
  session: BullpenSession
  onBack: () => void
  onComplete: (updated: BullpenSession) => void
}) {
  const [pitches, setPitches] = useState<PitchBlock[]>(session.pitches.map(p => ({ ...p, thrown: p.thrown ?? 0 })))
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const thrown = totalThrown(pitches)
  const target = totalTarget(pitches)

  function increment(i: number) {
    setPitches(prev => prev.map((p, idx) => idx === i ? { ...p, thrown: p.thrown + 1 } : p))
  }
  function decrement(i: number) {
    setPitches(prev => prev.map((p, idx) => idx === i ? { ...p, thrown: Math.max(0, p.thrown - 1) } : p))
  }

  async function handleComplete() {
    setSaving(true)
    setError(null)
    const result = await updateBullpenSession(session.id, { pitches, status: 'complete' })
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    onComplete({ ...session, pitches, status: 'complete' })
  }

  async function handleSaveProgress() {
    await updateBullpenSession(session.id, { pitches })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { handleSaveProgress(); onBack() }} className="text-[#3D5166] hover:text-[#0F1F33] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-sm text-[#0F1F33]" style={oswald}>{fmtDate(session.session_date)}</p>
          <p className="text-xs text-[#456080]">{thrown} / {target} pitches</p>
        </div>
        {/* Overall progress */}
        <div className="w-20">
          <div className="h-1.5 bg-[#DDE4ED] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C8102E] rounded-full transition-all"
              style={{ width: `${target > 0 ? Math.min(100, (thrown / target) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {pitches.map((p, i) => {
          const pct = p.target > 0 ? Math.min(100, (p.thrown / p.target) * 100) : 0
          const done = p.thrown >= p.target
          return (
            <div
              key={i}
              className="bg-white border rounded-xl px-4 py-4 transition-all"
              style={{ borderColor: done ? '#bbf7d0' : '#DDE4ED' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-[#0F1F33]" style={oswald}>{p.pitch_type}</p>
                  {p.focus && <p className="text-xs text-[#456080] mt-0.5 italic">{p.focus}</p>}
                </div>
                <span className="text-xs" style={{ ...oswald, color: done ? '#15803d' : '#0F1F33' }}>
                  {p.thrown} / {p.target}
                </span>
              </div>
              <div className="h-1 bg-[#DDE4ED] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: done ? '#22c55e' : '#C8102E' }}
                />
              </div>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => decrement(i)}
                  disabled={p.thrown === 0}
                  className="w-11 h-11 rounded-full border-2 border-[#DDE4ED] text-[#456080] text-xl flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >
                  −
                </button>
                <span className="text-3xl text-[#0F1F33] w-12 text-center" style={oswald}>{p.thrown}</span>
                <button
                  onClick={() => increment(i)}
                  className="w-11 h-11 rounded-full border-2 border-[#C8102E] text-[#C8102E] text-xl flex items-center justify-center active:scale-95 transition-transform active:bg-[#C8102E] active:text-white"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-xs text-[#C8102E] mt-3">{error}</p>}
      <button
        onClick={handleComplete}
        disabled={saving}
        className="mt-4 w-full bg-[#1C3A5C] hover:bg-[#223F63] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50"
        style={oswald}
      >
        {saving ? 'Saving…' : 'Complete Session'}
      </button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function BullpenModal({
  playerId,
  playerName,
  initialSessions,
  onClose,
}: {
  playerId: string
  playerName: string
  initialSessions: BullpenSession[]
  onClose: () => void
}) {
  const [view, setView]         = useState<View>('list')
  const [sessions, setSessions] = useState<BullpenSession[]>(initialSessions)
  const [runSession, setRunSession] = useState<BullpenSession | null>(null)
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleCreated(s: BullpenSession) {
    setSessions(prev => [s, ...prev])
    setView('list')
    router.refresh()
  }

  function handleRun(s: BullpenSession) {
    setRunSession(s)
    setView('run')
  }

  function handleComplete(updated: BullpenSession) {
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s))
    setView('list')
    setRunSession(null)
    router.refresh()
  }

  async function handleDelete(id: string) {
    await deleteBullpenSession(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-[#DDE4ED] flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDE4ED] shrink-0">
          <div>
            <p className="text-[10px] tracking-[0.25em] text-[#C8102E]" style={oswald}>Bullpen</p>
            <p className="text-sm text-[#0F1F33]" style={oswald}>{playerName}</p>
          </div>
          <button onClick={onClose} className="text-[#3D5166] hover:text-[#0F1F33] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden px-5 py-4">
          {view === 'list' && (
            <SessionList
              sessions={sessions}
              onNew={() => setView('build')}
              onRun={handleRun}
              onDelete={handleDelete}
            />
          )}
          {view === 'build' && (
            <BuildSession
              playerId={playerId}
              onBack={() => setView('list')}
              onCreated={handleCreated}
            />
          )}
          {view === 'run' && runSession && (
            <RunSession
              session={runSession}
              onBack={() => { setView('list'); setRunSession(null) }}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  )
}
