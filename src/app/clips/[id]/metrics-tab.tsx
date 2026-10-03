'use client'

import { useRef, useState, useTransition } from 'react'
import { AXIS_FORMAT_HINT, degreesToClock, parseClockAxis } from '@/lib/spin-axis'
import { readPitchCsv, skippedSummary, warningsSummary, type CsvPitchRow } from '@/lib/pitch-csv'
import { addPitchMetric, deletePitchMetric, deleteAllPitchMetrics, importPitchMetrics } from '@/app/actions/clips'
import { csvImportFrom, importTooBig, type PitchImport } from '@/lib/pitch-import'
import { runAction } from '@/lib/action-result'
import { parseTrackmanPDF, type ParsedPitchRow } from '@/app/actions/import-pdf'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// ── Spin axis → clock-face string ──────────────────────────────────────────
function axisToClock(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  const totalMinutes = Math.round(normalized / 0.5)
  const h = Math.floor(totalMinutes / 60) % 12 || 12
  const m = totalMinutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// ── Velocity benchmarks by level ────────────────────────────────────────────
const VELOCITY_BENCHMARKS: Record<string, { avg: number; good: number; elite: number }> = {
  'Youth':         { avg: 50, good: 58, elite: 65 },
  'Middle School': { avg: 65, good: 72, elite: 76 },
  'High School':   { avg: 78, good: 84, elite: 89 },
  'Amateur':       { avg: 85, good: 88, elite: 93 },
  'Professional':  { avg: 94, good: 97, elite: 99 },
}

// ── CSV parsing: src/lib/pitch-csv.ts (quote-aware; reports skipped rows) ──

// ── Types ────────────────────────────────────────────────────────────────────
type MetricRow = {
  id: string
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
  extension?: number | null
  vaa?: number | null
}

type ParsedRow = CsvPitchRow

// ── Velocity indicator ───────────────────────────────────────────────────────
function VelocityIndicator({ velocity, ageGroup }: { velocity: number | null; ageGroup: string | null }) {
  if (!velocity || !ageGroup || !VELOCITY_BENCHMARKS[ageGroup]) return null
  const bench = VELOCITY_BENCHMARKS[ageGroup]
  let color = '#C8102E'
  let label = 'Below avg'
  if (velocity >= bench.elite) { color = '#22c55e'; label = 'Elite' }
  else if (velocity >= bench.good) { color = '#22c55e'; label = 'Good' }
  else if (velocity >= bench.avg) { color = '#eab308'; label = 'Avg' }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded ml-1" style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function MetricsTab({
  clipId,
  role,
  playerAgeGroup,
  initialMetrics,
  onMetricsChange,
  canDelete = false,
  canAdd = false,
}: {
  clipId: string
  role: 'coach' | 'player'
  playerId: string
  playerAgeGroup: string | null
  playerPosition: string | null
  initialMetrics: MetricRow[]
  onMetricsChange?: (metrics: MetricRow[]) => void
  /** Only the player's direct coach (the rule RLS enforces on pitch_metrics). */
  canDelete?: boolean
  /** Manual entry and CSV/PDF import: the direct coach or the player (importPitchMetrics checks the same). */
  canAdd?: boolean
}) {
  const isCoach = role === 'coach'
  const fileRef = useRef<HTMLInputElement>(null)
  const pdfRef  = useRef<HTMLInputElement>(null)

  const [metrics, setMetrics] = useState<MetricRow[]>(initialMetrics)
  function updateMetrics(updater: (prev: MetricRow[]) => MetricRow[]) {
    setMetrics(prev => {
      const next = updater(prev)
      onMetricsChange?.(next)
      return next
    })
  }
  const [preview, setPreview] = useState<ParsedRow[] | null>(null)
  const [csvSkipped, setCsvSkipped] = useState<string | null>(null)
  // Deleting saved pitch rows (QA-017): rows leave the table only after the
  // server confirmed the delete; on failure they stay and the error shows.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [metricDeleteError, setMetricDeleteError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [axisWarning, setAxisWarning] = useState<string | null>(null)

  const [pdfPreview, setPdfPreview]   = useState<ParsedPitchRow[] | null>(null)
  const [pdfError, setPdfError]       = useState<string | null>(null)
  const [pdfSaving, setPdfSaving]     = useState(false)
  const [isParsing, startParsing]     = useTransition()

  const [showManual, setShowManual] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const emptyManual = { pitch_type: '', velocity: '', spin_rate: '', spin_axis: '', horizontal_break: '', vertical_break: '', extension: '', vaa: '' }
  const [manualForm, setManualForm] = useState(emptyManual)

  async function handleManualSave() {
    // Axis is entered as clock tilt ("8:45") and stored as degrees (12:00 = 0°).
    const axis = parseClockAxis(manualForm.spin_axis)
    if (!axis.ok) { setManualError(axis.error); return }
    setManualSaving(true)
    setManualError(null)
    setAxisWarning(null)
    const result = await addPitchMetric(clipId, {
      pitch_type: manualForm.pitch_type || null,
      velocity: manualForm.velocity ? parseFloat(manualForm.velocity) : null,
      spin_rate: manualForm.spin_rate ? parseInt(manualForm.spin_rate) : null,
      spin_axis: axis.degrees,
      horizontal_break: manualForm.horizontal_break ? parseFloat(manualForm.horizontal_break) : null,
      vertical_break: manualForm.vertical_break ? parseFloat(manualForm.vertical_break) : null,
      extension: manualForm.extension ? parseFloat(manualForm.extension) : null,
      vaa: manualForm.vaa ? parseFloat(manualForm.vaa) : null,
    })
    if (result?.error) {
      setManualError(result.error)
    } else if (result?.metric) {
      setAxisWarning(result.warning ?? null)
      updateMetrics(prev => [...prev, result.metric as MetricRow])
      setManualForm(emptyManual)
      setShowManual(false)
    }
    setManualSaving(false)
  }

  async function handleDeleteMetric(id: string) {
    setDeletingId(id)
    setMetricDeleteError(null)
    const result = await runAction(() => deletePitchMetric(id))
    setDeletingId(null)
    if (!result.ok) { setMetricDeleteError(`Pitch not deleted: ${result.error}`); return }
    updateMetrics(prev => prev.filter(m => m.id !== id))
  }

  async function handleDeleteAllMetrics() {
    setDeletingAll(true)
    setMetricDeleteError(null)
    const result = await runAction(() => deleteAllPitchMetrics(clipId))
    setDeletingAll(false)
    if (!result.ok) { setMetricDeleteError(`Pitches not deleted: ${result.error}`); return }
    const removed = new Set(result.value && 'removedIds' in result.value ? result.value.removedIds ?? [] : [])
    setConfirmAll(false)
    updateMetrics(prev => prev.filter(m => !removed.has(m.id)))
    if (metrics.some(m => !removed.has(m.id))) setMetricDeleteError('Some pitches weren\'t deleted. Refresh the page and try again.')
  }

  // ── Handle file selection ──────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setSaveError(null)
    setCsvSkipped(null)
    setPreview(null)
    const reader = new FileReader()
    reader.onload = () => {
      const result = readPitchCsv(typeof reader.result === 'string' ? reader.result : '')
      if (!result.ok) { setSaveError(result.error); return }
      // Rows that can't be read are listed, never saved quietly (QA-014).
      // Stray quotes don't stop the import but are pointed out.
      setCsvSkipped([skippedSummary(result.skipped), warningsSummary(result.warnings)].filter(Boolean).join(' ') || null)
      setPreview(result.rows)
    }
    reader.onerror = () => {
      console.error('[csv import] could not read file', reader.error)
      setSaveError('Couldn\'t read this file. Try exporting the CSV again.')
    }
    // Clear the picker once the file is read, so picking the same file again
    // (e.g. after fixing it) fires onChange and imports it again.
    reader.onloadend = () => { input.value = '' }
    reader.readAsText(file)
  }

  // ── Save parsed rows (server action; all-or-nothing) ─────────────────
  // The table changes only after the server confirmed every row was saved.
  async function handleSave() {
    if (!preview) return
    setSaving(true)
    setSaveError(null)
    setAxisWarning(null)
    const payload = csvImportFrom(preview)
    const tooBig = importTooBig(clipId, payload)
    if (tooBig) { setSaving(false); setSaveError(tooBig); return }
    const result = await runAction(() => importPitchMetrics(clipId, payload))
    setSaving(false)
    if (!result.ok) { setSaveError(result.error); return }
    const saved = 'metrics' in result.value ? (result.value.metrics as MetricRow[]) : null
    if (!saved) { setSaveError('Couldn\'t confirm the import. Refresh the page to check before trying again.'); return }
    setAxisWarning(result.warning)
    updateMetrics(prev => [...prev, ...saved])
    setPreview(null)
    setCsvSkipped(null)   // the skipped-rows note was about this import; it's done now
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Handle PDF selection ──────────────────────────────────────────────
  function handlePdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfError(null)
    setPdfPreview(null)
    const fd = new FormData()
    fd.set('file', file)
    startParsing(async () => {
      const { pitches, error } = await parseTrackmanPDF(fd)
      if (error) { setPdfError(error); return }
      setPdfPreview(pitches)
    })
  }

  async function handlePdfSave() {
    if (!pdfPreview) return
    setPdfSaving(true)
    setPdfError(null)
    setAxisWarning(null)
    const rows = pdfPreview.map(r => ({
      pitch_type: r.pitch_type,
      velocity: r.velocity,
      spin_rate: r.spin_rate,
      spin_axis: r.spin_axis,
      horizontal_break: r.horizontal_break,
      vertical_break: r.vertical_break,
    }))
    const payload: PitchImport = { source: 'pdf', rows }
    const tooBig = importTooBig(clipId, payload)
    if (tooBig) { setPdfSaving(false); setPdfError(tooBig); return }
    const result = await runAction(() => importPitchMetrics(clipId, payload))
    setPdfSaving(false)
    if (!result.ok) { setPdfError(result.error); return }
    const saved = 'metrics' in result.value ? (result.value.metrics as MetricRow[]) : null
    if (!saved) { setPdfError('Couldn\'t confirm the import. Refresh the page to check before trying again.'); return }
    setAxisWarning(result.warning)
    updateMetrics(prev => [...prev, ...saved])
    setPdfPreview(null)
    if (pdfRef.current) pdfRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      {/* ── Data import (CSV + PDF): direct coach or the player only ─────── */}
      {canAdd && (
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-4 space-y-4">
        <div>
          <p className="text-xs text-[#3D5166] tracking-widest" style={oswald}>Import Pitch Analytics</p>
          <p className="text-[10px] text-[#3D5166]/50 mt-0.5">Works with TrackMan pitch tracking files</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* CSV */}
          <div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full max-sm:min-h-11 border-2 border-dashed border-[#DDE4ED] rounded-md py-3 text-xs text-[#456080] hover:border-[#C8102E] hover:text-[#0F1F33] transition-colors"
            >
              <span className="block font-medium" style={oswald}>CSV</span>
              <span className="block text-[10px] text-[#3D5166]/60 mt-0.5">TrackMan</span>
            </button>
          </div>

          {/* PDF */}
          <div>
            <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handlePdfFile} />
            <button
              onClick={() => pdfRef.current?.click()}
              disabled={isParsing}
              className="w-full max-sm:min-h-11 border-2 border-dashed border-[#DDE4ED] rounded-md py-3 text-xs text-[#456080] hover:border-[#C8102E] hover:text-[#0F1F33] transition-colors disabled:opacity-50"
            >
              <span className="block font-medium" style={oswald}>{isParsing ? 'Reading…' : 'PDF'}</span>
              <span className="block text-[10px] text-[#3D5166]/60 mt-0.5">TrackMan report card</span>
            </button>
          </div>
        </div>

        {saveError && <p role="alert" className="text-xs text-[#C8102E]">{saveError}</p>}
        {pdfError  && <p role="alert" className="text-xs text-[#C8102E]">{pdfError}</p>}
        {axisWarning && <p role="status" className="text-xs text-[#B45309]">{axisWarning}</p>}

        {csvSkipped && <p role="status" className="text-xs text-[#B45309]">{csvSkipped}</p>}

        {/* CSV preview */}
        {preview && preview.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#456080]">Preview: {preview.length} pitch{preview.length !== 1 ? 'es' : ''} parsed</p>
            <PreviewTable rows={preview} ageGroup={playerAgeGroup} />
            <button onClick={handleSave} disabled={saving}
              className="max-sm:min-h-11 px-4 py-2 rounded-md text-xs text-white font-medium tracking-wide transition-colors"
              style={{ ...oswald, background: saving ? '#4A6880' : '#C8102E' }}>
              {saving ? 'Saving…' : `Save ${preview.length} pitch${preview.length !== 1 ? 'es' : ''}`}
            </button>
          </div>
        )}
        {preview && preview.length === 0 && (
          <p className="text-xs text-[#C8102E]">No recognizable pitch rows found. Check column headers.</p>
        )}

        {/* PDF preview */}
        {pdfPreview && pdfPreview.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#456080]">PDF preview: {pdfPreview.length} pitch type{pdfPreview.length !== 1 ? 's' : ''} found</p>
            <div className="overflow-x-auto rounded-lg border border-[#DDE4ED]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#DDE4ED] bg-[#F5F7FA]">
                    {['Pitch', 'Avg Velo', 'Spin', 'IVB', 'HB', 'Axis'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[#3D5166] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pdfPreview.map((r, i) => (
                    <tr key={i} className="border-b border-[#DDE4ED] last:border-0">
                      <td className="px-3 py-2 font-medium text-[#0F1F33]">{r.pitch_type}</td>
                      <td className="px-3 py-2 text-[#3D5166] font-mono">{r.velocity ?? '—'}</td>
                      <td className="px-3 py-2 text-[#3D5166] font-mono">{r.spin_rate?.toLocaleString() ?? '—'}</td>
                      <td className="px-3 py-2 text-[#3D5166] font-mono">{r.vertical_break != null ? `${r.vertical_break > 0 ? '+' : ''}${r.vertical_break}"` : '—'}</td>
                      <td className="px-3 py-2 text-[#3D5166] font-mono">{r.horizontal_break != null ? `${r.horizontal_break > 0 ? '+' : ''}${r.horizontal_break}"` : '—'}</td>
                      <td className="px-3 py-2 text-[#3D5166] font-mono">{r.spin_axis != null ? `${degreesToClock(r.spin_axis)} (${r.spin_axis}°)` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handlePdfSave} disabled={pdfSaving}
              className="max-sm:min-h-11 px-4 py-2 rounded-md text-xs text-white font-medium tracking-wide transition-colors"
              style={{ ...oswald, background: pdfSaving ? '#4A6880' : '#C8102E' }}>
              {pdfSaving ? 'Saving…' : `Save ${pdfPreview.length} pitch type${pdfPreview.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
      )}

      {/* ── Manual entry (coach CSV or player manual) ───────────────────── */}
      {canAdd && (
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#3D5166] tracking-widest" style={oswald}>
            {isCoach ? 'Add Single Pitch' : 'Enter Pitch Data'}
          </p>
          <button
            onClick={() => setShowManual(v => !v)}
            className="text-xs text-[#C8102E] hover:text-[#9E0E24] transition-colors max-sm:min-h-11 max-sm:min-w-11"
            style={oswald}
          >
            {showManual ? 'Cancel' : '+ Add Pitch'}
          </button>
        </div>

        {showManual && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'pitch_type',       label: 'Pitch Type',    placeholder: 'Fastball', type: 'text' },
                { key: 'velocity',         label: 'Velo (mph)',    placeholder: '89.0',  type: 'number' },
                { key: 'spin_rate',        label: 'Spin (rpm)',    placeholder: '2248',  type: 'number' },
                { key: 'spin_axis',        label: 'Axis (tilt)',   placeholder: '1:15',  type: 'text', hint: AXIS_FORMAT_HINT },
                { key: 'vertical_break',   label: 'IVB (in)',      placeholder: '18.7',  type: 'number' },
                { key: 'horizontal_break', label: 'H-Break (in)',  placeholder: '8.1',   type: 'number' },
                { key: 'extension',        label: 'Ext (ft)',      placeholder: '6.4',   type: 'number' },
                { key: 'vaa',              label: 'VAA (°)',       placeholder: '-5.1',  type: 'number' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-[10px] text-[#3D5166] mb-1" style={oswald}>{field.label}</label>
                  <input
                    type={field.type}
                    step={field.type === 'number' ? 'any' : undefined}
                    title={field.hint}
                    aria-label={field.hint ? `${field.label}. ${field.hint}` : undefined}
                    placeholder={field.placeholder}
                    value={manualForm[field.key as keyof typeof manualForm]}
                    onChange={e => { setManualForm(f => ({ ...f, [field.key]: e.target.value })); setManualError(null) }}
                    className="w-full bg-[#F5F7FA] border border-[#DDE4ED] rounded px-2 py-1.5 text-sm text-[#0F1F33] focus:outline-none focus:border-[#456080]"
                  />
                </div>
              ))}
            </div>
            {manualError && <p className="text-xs text-[#C8102E]">{manualError}</p>}
            <button
              onClick={handleManualSave}
              disabled={manualSaving}
              className="max-sm:min-h-11 px-4 py-2 rounded-md text-xs text-white transition-colors disabled:opacity-50"
              style={{ ...oswald, background: '#C8102E' }}
            >
              {manualSaving ? 'Saving…' : 'Save Pitch'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* ── Saved metrics table ──────────────────────────────────────────── */}
      {metrics.length > 0 ? (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-[#DDE4ED] flex items-center justify-between">
            <div>
              <p className="text-xs text-[#3D5166] tracking-widest" style={oswald}>Pitch Analytics</p>
              <p className="text-[10px] text-[#3D5166]/50 mt-0.5">Compatible with TrackMan exports</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-[#3D5166]/50">{metrics.length} pitch{metrics.length !== 1 ? 'es' : ''}</p>
              {canDelete && !confirmAll && (
                <button type="button" onClick={() => { setConfirmAll(true); setMetricDeleteError(null) }}
                  className="!min-h-11 px-2 text-[10px] tracking-widest text-[#3D5166] hover:text-[#C8102E] transition-colors" style={oswald}>
                  Delete all
                </button>
              )}
            </div>
          </div>
          {canDelete && confirmAll && (
            <div role="alertdialog" aria-label="Delete all pitches" className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#DDE4ED] bg-[#FFF5F5]">
              <span className="text-xs text-[#456080]">Delete all {metrics.length} pitch{metrics.length !== 1 ? 'es' : ''} on this clip? This can&apos;t be undone.</span>
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
          {metricDeleteError && <p role="alert" className="px-4 py-2 border-b border-[#DDE4ED] text-xs text-[#C8102E]">{metricDeleteError}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#DDE4ED] bg-[#F9FAFB]">
                  {[
                    { key: 'pitch_type',       label: 'Pitch' },
                    { key: 'velocity',          label: 'Velo (mph)' },
                    { key: 'spin_rate',         label: 'Spin (rpm)' },
                    { key: 'spin_axis',         label: 'Axis / Tilt' },
                    { key: 'vertical_break',    label: 'IVB (in)' },
                    { key: 'horizontal_break',  label: 'H-Break (in)' },
                    { key: 'extension',         label: 'Ext (ft)' },
                    { key: 'vaa',               label: 'VAA (°)' },
                  ].map(h => (
                    <th key={h.key} className="px-3 py-2 text-left text-[10px] text-[#3D5166] tracking-widest font-medium whitespace-nowrap" style={oswald}>
                      {h.label}
                    </th>
                  ))}
                  {canDelete && <th className="px-1 py-2"><span className="sr-only">Delete</span></th>}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id} className="border-b border-[#DDE4ED] hover:bg-[#F0F4F8] transition-colors">
                    <td className="px-3 py-2.5 text-[#0F1F33] font-medium">{m.pitch_type ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {m.velocity != null ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[#0F1F33] font-mono">{m.velocity.toFixed(1)}</span>
                          <VelocityIndicator velocity={m.velocity} ageGroup={playerAgeGroup} />
                        </span>
                      ) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#0F1F33] font-mono">
                      {m.spin_rate != null ? m.spin_rate.toLocaleString() : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.spin_axis != null ? (
                        <span className="flex flex-col">
                          <span className="text-[#0F1F33] font-mono text-xs">{axisToClock(m.spin_axis)}</span>
                          <span className="text-[#3D5166]/50 text-[10px]">{m.spin_axis}°</span>
                        </span>
                      ) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {m.vertical_break != null ? (
                        <span className={m.vertical_break > 0 ? 'text-emerald-600' : 'text-blue-600'}>
                          {m.vertical_break > 0 ? '+' : ''}{m.vertical_break.toFixed(1)}&quot;
                        </span>
                      ) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {m.horizontal_break != null ? (
                        <span className={m.horizontal_break > 0 ? 'text-violet-600' : 'text-orange-500'}>
                          {m.horizontal_break > 0 ? '+' : ''}{m.horizontal_break.toFixed(1)}&quot;
                        </span>
                      ) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#0F1F33] font-mono">
                      {m.extension != null ? m.extension.toFixed(1) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#0F1F33] font-mono">
                      {m.vaa != null ? m.vaa.toFixed(1) : <span className="text-[#3D5166]/40">—</span>}
                    </td>
                    {canDelete && (
                      <td className="px-1 py-1 text-right">
                        <button type="button" onClick={() => handleDeleteMetric(m.id)} disabled={deletingId !== null || deletingAll}
                          aria-label={`Delete pitch ${m.pitch_type ?? ''}${m.velocity != null ? ` ${m.velocity.toFixed(1)} mph` : ''}`.trim()}
                          title="Delete this pitch"
                          className="!min-h-11 !min-w-11 inline-flex items-center justify-center rounded text-xs text-[#3D5166] hover:text-[#C8102E] hover:bg-[#FFF5F5] transition-colors disabled:opacity-40">
                          {deletingId === m.id ? '…' : '✕'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-6 text-center">
          <p className="text-sm text-[#456080]">No pitch metrics yet.</p>
          {canAdd ? (
            <p className="text-xs text-[#3D5166] mt-1">
              Upload a CSV or PDF above to add pitch data for this clip.
            </p>
          ) : isCoach ? (
            <p className="text-xs text-[#3D5166] mt-1">
              Only the player&apos;s own coach can add pitch data.
            </p>
          ) : (
            <p className="text-xs text-[#3D5166] mt-1">
              Your coach will upload pitch data when available.
            </p>
          )}
        </div>
      )}

      {/* ── Benchmark legend ─────────────────────────────────────────────── */}
      {playerAgeGroup && VELOCITY_BENCHMARKS[playerAgeGroup] && (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md px-4 py-3">
          <p className="text-[10px] text-[#3D5166] tracking-widest mb-2" style={oswald}>
            {playerAgeGroup} Velocity Benchmarks
          </p>
          <div className="flex gap-4 text-xs text-[#456080]">
            <span>Avg: {VELOCITY_BENCHMARKS[playerAgeGroup].avg} mph</span>
            <span>Good: {VELOCITY_BENCHMARKS[playerAgeGroup].good}+ mph</span>
            <span>Elite: {VELOCITY_BENCHMARKS[playerAgeGroup].elite}+ mph</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Preview table (before saving) ───────────────────────────────────────────
function PreviewTable({ rows, ageGroup }: { rows: ParsedRow[]; ageGroup: string | null }) {
  return (
    <div className="overflow-x-auto rounded border border-[#DDE4ED]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#DDE4ED]">
            {['Pitch Type', 'Velocity', 'Spin Rate', 'Spin Axis', 'H-Break', 'V-Break'].map(h => (
              <th key={h} className="px-2 py-1.5 text-left text-[#3D5166] tracking-widest" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((r, i) => (
            <tr key={i} className="border-b border-[#DDE4ED] last:border-0">
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.pitch_type ?? '—'}</td>
              <td className="px-2 py-1.5 text-[#0F1F33]">
                {r.velocity != null ? (
                  <span>
                    {r.velocity.toFixed(1)}
                    <VelocityIndicator velocity={r.velocity} ageGroup={ageGroup} />
                  </span>
                ) : '—'}
              </td>
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.spin_rate != null ? r.spin_rate.toLocaleString() : '—'}</td>
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.spin_axis != null ? `${degreesToClock(r.spin_axis)} (${r.spin_axis}°)` : '—'}</td>
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.horizontal_break != null ? `${r.horizontal_break.toFixed(1)}"` : '—'}</td>
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.vertical_break != null ? `${r.vertical_break.toFixed(1)}"` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && (
        <p className="px-2 py-1.5 text-[10px] text-[#3D5166]">…and {rows.length - 10} more rows</p>
      )}
    </div>
  )
}
