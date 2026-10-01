'use client'

import { useState } from 'react'
import { saveHittingMetrics, deleteHittingMetric, deleteAllHittingMetrics } from '@/app/actions/clips'
import { runAction } from '@/lib/action-result'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface HittingMetrics {
  ev_avg:           number | null
  ev_max:           number | null
  launch_angle_avg: number | null
  barrel_rate:      number | null
  hard_hit_rate:    number | null
  sweet_spot_rate:  number | null
  attack_angle:     number | null
  bat_speed:        number | null
}

const FIELDS: { key: keyof HittingMetrics; label: string; unit: string; desc: string }[] = [
  { key: 'ev_avg',           label: 'Avg Exit Velocity',  unit: 'mph', desc: 'Average speed of the ball off the bat' },
  { key: 'ev_max',           label: 'Max Exit Velocity',  unit: 'mph', desc: 'Hardest-hit ball this session' },
  { key: 'launch_angle_avg', label: 'Avg Launch Angle',   unit: '°',   desc: 'Average degrees above horizontal. 8–32° is the sweet spot.' },
  { key: 'barrel_rate',      label: 'Barrel Rate',        unit: '%',   desc: 'Balls hit with optimal EV + launch angle (elite contact)' },
  { key: 'hard_hit_rate',    label: 'Hard Hit %',         unit: '%',   desc: 'Balls hit 95 mph or harder' },
  { key: 'sweet_spot_rate',  label: 'Sweet Spot %',       unit: '%',   desc: 'Balls hit with launch angle between 8° and 32°' },
  { key: 'attack_angle',     label: 'Attack Angle',       unit: '°',   desc: 'How much the bat is traveling upward through the contact zone' },
  { key: 'bat_speed',        label: 'Bat Speed',          unit: 'mph', desc: 'Speed of the barrel through the hitting zone' },
]

function empty(): HittingMetrics {
  return { ev_avg: null, ev_max: null, launch_angle_avg: null, barrel_rate: null, hard_hit_rate: null, sweet_spot_rate: null, attack_angle: null, bat_speed: null }
}

export default function HittingMetricsTab({
  clipId,
  role,
  initial,
  canDelete = false,
}: {
  clipId: string
  role: 'coach' | 'player'
  initial: HittingMetrics | null
  /** Only the player's direct coach may delete saved hitting data. */
  canDelete?: boolean
}) {
  const [metrics,   setMetrics]   = useState<HittingMetrics>(initial ?? empty())
  const [saveState, setSaveState] = useState<SaveState>(initial ? 'saved' : 'idle')
  const [error,     setError]     = useState<string | null>(null)
  const isCoach = role === 'coach'
  // Deleting saved values: they leave the screen only after the server
  // confirmed the delete; on failure they stay and the error shows.
  const [saved,       setSaved]       = useState<HittingMetrics>(initial ?? empty())
  const [deletingKey, setDeletingKey] = useState<keyof HittingMetrics | null>(null)
  const [confirmAll,  setConfirmAll]  = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const hasSaved = Object.values(saved).some(v => v !== null)

  function setValue(key: keyof HittingMetrics, raw: string) {
    const val = raw === '' ? null : parseFloat(raw)
    setMetrics(prev => ({ ...prev, [key]: val !== null && isNaN(val) ? prev[key] : val }))
    setSaveState('idle')
    setError(null)
  }

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    const result = await saveHittingMetrics(clipId, metrics)
    if (result?.error) {
      setError(result.error)
      setSaveState('error')
    } else {
      setSaved(metrics)
      setSaveState('saved')
    }
  }

  async function handleDeleteMetric(key: keyof HittingMetrics) {
    setDeletingKey(key)
    setDeleteError(null)
    const result = await runAction(() => deleteHittingMetric(clipId, key))
    setDeletingKey(null)
    if (!result.ok) { setDeleteError(`Not deleted: ${result.error}`); return }
    setSaved(prev => ({ ...prev, [key]: null }))
    setMetrics(prev => ({ ...prev, [key]: null }))
  }

  async function handleDeleteAllMetrics() {
    setDeletingAll(true)
    setDeleteError(null)
    const result = await runAction(() => deleteAllHittingMetrics(clipId))
    setDeletingAll(false)
    if (!result.ok) { setDeleteError(`Not deleted: ${result.error}`); return }
    setConfirmAll(false)
    setSaved(empty())
    setMetrics(empty())
    setSaveState('idle')
  }

  const hasAny = Object.values(metrics).some(v => v !== null)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#3D5166]" style={os}>Hitting Data</p>
          <p className="text-[11px] text-[#8096AE] mt-0.5">Trackman session stats</p>
        </div>
        <div className="flex items-center gap-2">
        {canDelete && hasSaved && !confirmAll && (
          <button type="button" onClick={() => { setConfirmAll(true); setDeleteError(null) }}
            className="!min-h-11 px-2 text-[10px] tracking-widest text-[#3D5166] hover:text-[#C8102E] transition-colors" style={os}>
            Delete all
          </button>
        )}
        {isCoach && hasAny && (
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="text-[10px] px-3 py-1.5 rounded-md border border-[#DDE4ED] transition-colors disabled:opacity-40"
            style={{
              ...os,
              background: saveState === 'saved' ? '#ECFDF5' : '#F0F4F8',
              color: saveState === 'saved' ? '#16a34a' : '#456080',
            }}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
          </button>
        )}
        </div>
      </div>

      {canDelete && confirmAll && (
        <div role="alertdialog" aria-label="Delete all hitting data" className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 rounded-lg border border-[#DDE4ED] bg-[#FFF5F5]">
          <span className="text-xs text-[#456080]">Delete all saved hitting data on this clip? This can&apos;t be undone.</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleDeleteAllMetrics} disabled={deletingAll}
              className="!min-h-11 px-3 rounded text-xs text-white bg-[#C8102E] hover:bg-red-700 transition-colors disabled:opacity-50">
              {deletingAll ? 'Deleting…' : 'Delete all'}
            </button>
            <button type="button" onClick={() => setConfirmAll(false)} disabled={deletingAll}
              className="!min-h-11 px-3 text-xs text-[#3D5166] hover:text-[#456080] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
      {deleteError && <p role="alert" className="text-xs text-[#C8102E]">{deleteError}</p>}

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(f => (
          <div key={f.key} className="bg-[#F8FAFC] border border-[#DDE4ED] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#3D5166]" style={os}>{f.label}</p>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-[#8096AE]" style={os}>{f.unit}</span>
                {canDelete && saved[f.key] != null && (
                  <button type="button" onClick={() => handleDeleteMetric(f.key)} disabled={deletingKey !== null || deletingAll}
                    aria-label={`Delete ${f.label}`}
                    title={`Delete ${f.label}`}
                    className="!min-h-11 !min-w-11 -my-3 -mr-2 inline-flex items-center justify-center rounded text-xs text-[#3D5166] hover:text-[#C8102E] hover:bg-[#FFF5F5] transition-colors disabled:opacity-40">
                    {deletingKey === f.key ? '…' : '✕'}
                  </button>
                )}
              </div>
            </div>
            {isCoach ? (
              <input
                type="number"
                step="0.1"
                value={metrics[f.key] ?? ''}
                onChange={e => setValue(f.key, e.target.value)}
                placeholder="—"
                className="w-full text-lg font-semibold text-[#0F1F33] bg-transparent border-none focus:outline-none placeholder:text-[#C0CFE0]"
                style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
              />
            ) : (
              <p className="text-lg font-semibold text-[#0F1F33]" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}>
                {metrics[f.key] != null ? `${metrics[f.key]}` : <span className="text-[#C0CFE0]">—</span>}
              </p>
            )}
            <p className="text-[10px] text-[#8096AE] leading-snug">{f.desc}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-[#C8102E]">{error}</p>}

      {isCoach && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || !hasAny}
            className="text-[10px] px-4 py-2 rounded-md border border-[#DDE4ED] transition-colors disabled:opacity-40"
            style={{
              ...os,
              background: saveState === 'saved' ? '#ECFDF5' : '#1C3A5C',
              color: saveState === 'saved' ? '#16a34a' : 'white',
            }}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save Hitting Data'}
          </button>
        </div>
      )}
    </div>
  )
}
