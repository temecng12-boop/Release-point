'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// ── Column aliases ──────────────────────────────────────────────────────────
const COLUMN_MAP = {
  pitch_type:     ['Pitch Type', 'PitchType', 'Type'],
  velocity:       ['Velocity', 'Speed (mph)', 'RelSpeed', 'Pitch Speed'],
  spin_rate:      ['Spin Rate (rpm)', 'SpinRate', 'Spin Rate'],
  spin_axis:      ['Spin Axis (deg)', 'SpinAxis', 'Spin Axis'],
  horiz_break:    ['Horizontal Break (in)', 'HorzBreak', 'Horizontal Break'],
  vert_break:     ['Induced Vertical Break (in)', 'InducedVertBreak', 'Induced Vert Break'],
  release_height: ['Release Height (ft)', 'ReleaseHeight'],
  extension:      ['Extension (ft)', 'Extension'],
}

// ── Velocity benchmarks by level ────────────────────────────────────────────
const VELOCITY_BENCHMARKS: Record<string, { avg: number; good: number; elite: number }> = {
  'Youth':         { avg: 50, good: 58, elite: 65 },
  'Middle School': { avg: 65, good: 72, elite: 76 },
  'High School':   { avg: 78, good: 84, elite: 89 },
  'Amateur':       { avg: 85, good: 88, elite: 93 },
  'Professional':  { avg: 94, good: 97, elite: 99 },
}

// ── CSV parsing ─────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

function mapRow(row: Record<string, string>) {
  const get = (aliases: string[]): string | null => {
    for (const a of aliases) {
      if (row[a] !== undefined && row[a] !== '') return row[a]
    }
    return null
  }
  return {
    pitch_type:        get(COLUMN_MAP.pitch_type),
    velocity:          parseFloat(get(COLUMN_MAP.velocity) ?? '') || null,
    spin_rate:         parseInt(get(COLUMN_MAP.spin_rate) ?? '') || null,
    spin_axis:         parseInt(get(COLUMN_MAP.spin_axis) ?? '') || null,
    horizontal_break:  parseFloat(get(COLUMN_MAP.horiz_break) ?? '') || null,
    vertical_break:    parseFloat(get(COLUMN_MAP.vert_break) ?? '') || null,
    release_height:    parseFloat(get(COLUMN_MAP.release_height) ?? '') || null,
    release_extension: parseFloat(get(COLUMN_MAP.extension) ?? '') || null,
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
type MetricRow = {
  id: string
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}

type ParsedRow = ReturnType<typeof mapRow> & { _raw: Record<string, string> }

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
}: {
  clipId: string
  role: 'coach' | 'player'
  playerId: string
  playerAgeGroup: string | null
  playerPosition: string | null
  initialMetrics: MetricRow[]
}) {
  const isCoach = role === 'coach'
  const fileRef = useRef<HTMLInputElement>(null)

  const [metrics, setMetrics] = useState<MetricRow[]>(initialMetrics)
  const [preview, setPreview] = useState<ParsedRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Handle file selection ──────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaveError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      const mapped: ParsedRow[] = rows
        .map(r => ({ ...mapRow(r), _raw: r }))
        .filter(r => r.pitch_type !== null || r.velocity !== null)
      setPreview(mapped)
    }
    reader.readAsText(file)
  }

  // ── Save parsed rows to DB ─────────────────────────────────────────────
  async function handleSave() {
    if (!preview) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const inserts = preview.map(({ _raw, ...fields }) => ({
        clip_id: clipId,
        created_by: user.id,
        raw_data: _raw,
        ...fields,
      }))

      const { data, error } = await supabase
        .from('pitch_metrics')
        .insert(inserts)
        .select('id, pitch_type, velocity, spin_rate, spin_axis, horizontal_break, vertical_break')

      if (error) throw error

      setMetrics(prev => [...prev, ...(data as MetricRow[])])
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Upload area (coach only) ─────────────────────────────────────── */}
      {isCoach && (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-4">
          <p className="text-xs text-[#3D5166] tracking-widest mb-3" style={oswald}>
            Upload Rapsodo Data
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-[#DDE4ED] rounded-md py-4 text-sm text-[#456080] hover:border-[#C8102E] hover:text-[#0F1F33] transition-colors"
          >
            Upload Rapsodo CSV
          </button>

          {saveError && (
            <p className="mt-2 text-xs text-[#C8102E]">{saveError}</p>
          )}

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-[#456080]">
                Preview — {preview.length} pitch{preview.length !== 1 ? 'es' : ''} parsed
              </p>
              <PreviewTable rows={preview} ageGroup={playerAgeGroup} />
              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 px-4 py-2 rounded-md text-xs text-white font-medium tracking-wide transition-colors"
                style={{ ...oswald, background: saving ? '#4A6880' : '#C8102E' }}
              >
                {saving ? 'Saving…' : `Save ${preview.length} pitch${preview.length !== 1 ? 'es' : ''}`}
              </button>
            </div>
          )}

          {preview && preview.length === 0 && (
            <p className="mt-3 text-xs text-[#C8102E]">
              No recognizable pitch rows found. Check column headers.
            </p>
          )}
        </div>
      )}

      {/* ── Saved metrics table ──────────────────────────────────────────── */}
      {metrics.length > 0 ? (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-[#DDE4ED]">
            <p className="text-xs text-[#3D5166] tracking-widest" style={oswald}>
              Pitch Metrics
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#DDE4ED]">
                  {['Pitch Type', 'Velocity', 'Spin Rate', 'Spin Axis', 'H-Break', 'V-Break'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] text-[#3D5166] tracking-widest font-medium" style={oswald}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id} className="border-b border-[#DDE4ED] hover:bg-[#F0F4F8] transition-colors">
                    <td className="px-3 py-2 text-[#0F1F33]">{m.pitch_type ?? '—'}</td>
                    <td className="px-3 py-2 text-[#0F1F33]">
                      {m.velocity != null ? (
                        <span>
                          {m.velocity.toFixed(1)} mph
                          <VelocityIndicator velocity={m.velocity} ageGroup={playerAgeGroup} />
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#0F1F33]">
                      {m.spin_rate != null ? `${m.spin_rate.toLocaleString()} rpm` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#0F1F33]">
                      {m.spin_axis != null ? `${m.spin_axis}°` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#0F1F33]">
                      {m.horizontal_break != null ? `${m.horizontal_break.toFixed(1)}"` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#0F1F33]">
                      {m.vertical_break != null ? `${m.vertical_break.toFixed(1)}"` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-6 text-center">
          <p className="text-sm text-[#456080]">No pitch metrics yet.</p>
          {isCoach ? (
            <p className="text-xs text-[#3D5166] mt-1">
              Upload a Rapsodo CSV above to add pitch data for this clip.
            </p>
          ) : (
            <p className="text-xs text-[#3D5166] mt-1">
              Your coach will upload Rapsodo data when available.
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
              <td className="px-2 py-1.5 text-[#0F1F33]">{r.spin_axis != null ? `${r.spin_axis}°` : '—'}</td>
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
