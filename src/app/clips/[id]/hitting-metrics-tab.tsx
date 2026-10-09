'use client'

import { useRef, useState } from 'react'
import { saveHittingMetrics } from '@/app/actions/clips'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface HittingMetrics {
  ev_avg:           number | null
  ev_max:           number | null
  ev_90th?:         number | null
  distance_avg?:    number | null
  distance_max?:    number | null
  launch_angle_avg: number | null
  barrel_rate:      number | null
  hard_hit_rate:    number | null
  sweet_spot_rate:  number | null
  attack_angle:     number | null
  bat_speed:        number | null
  gb_rate?:         number | null
  ld_rate?:         number | null
  fb_rate?:         number | null
  pull_rate?:       number | null
  oppo_rate?:       number | null
  contact_rate?:    number | null
  whiff_rate?:      number | null
}

// ── CSV column aliases ────────────────────────────────────────────────────────
const HIT_COL = {
  exit_velocity: ['ExitSpeed', 'Exit Velocity (mph)', 'EV', 'ExitVelocity', 'Launch Speed', 'exit_speed'],
  launch_angle:  ['Angle', 'Launch Angle (deg)', 'LA', 'LaunchAngle', 'Vert. Angle', 'launch_angle'],
  distance:      ['Distance', 'Distance (ft)', 'Dist', 'HitDistance', 'hit_distance'],
  direction:     ['Direction', 'SprayAngle', 'Hit Direction (deg)', 'HorizAngle', 'Horiz. Angle', 'spray_angle'],
  hit_type:      ['AutoHitType', 'HitType', 'Contact Type', 'Type', 'TaggedHitType', 'contact_type'],
  result:        ['PlayResult', 'Result', 'Outcome', 'play_result'],
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function getCol(row: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== '') return row[a]
  }
  return null
}

function pct(count: number, total: number) {
  return Math.round(count / total * 1000) / 10
}

function computeStats(rows: Record<string, string>[]): Partial<HittingMetrics> & { rowCount: number } {
  const evVals: number[] = []
  const laVals: number[] = []
  const distVals: number[] = []
  const dirVals: number[] = []
  const hitTypes: string[] = []
  let swingMisses = 0

  for (const row of rows) {
    const result = getCol(row, HIT_COL.result)?.toLowerCase() ?? ''
    if (result.includes('swinging') || result === 'swingstrike' || result === 'strikeswinging') swingMisses++

    const ev = parseFloat(getCol(row, HIT_COL.exit_velocity) ?? '')
    if (!isNaN(ev) && ev > 0) {
      evVals.push(ev)
      const la = parseFloat(getCol(row, HIT_COL.launch_angle) ?? '')
      if (!isNaN(la)) laVals.push(la)
      const dist = parseFloat(getCol(row, HIT_COL.distance) ?? '')
      if (!isNaN(dist) && dist > 0) distVals.push(dist)
      const dir = parseFloat(getCol(row, HIT_COL.direction) ?? '')
      if (!isNaN(dir)) dirVals.push(dir)
      const ht = getCol(row, HIT_COL.hit_type)
      if (ht) hitTypes.push(ht.toLowerCase())
    }
  }

  const n = evVals.length
  if (n === 0) return { rowCount: 0 }

  const ev_avg = Math.round(evVals.reduce((a, b) => a + b, 0) / n * 10) / 10
  const ev_max = Math.round(Math.max(...evVals) * 10) / 10
  const sorted90 = [...evVals].sort((a, b) => a - b)
  const ev_90th = Math.round(sorted90[Math.min(Math.floor(n * 0.9), n - 1)] * 10) / 10

  const launch_angle_avg = laVals.length > 0
    ? Math.round(laVals.reduce((a, b) => a + b, 0) / laVals.length * 10) / 10
    : null
  const distance_avg = distVals.length > 0
    ? Math.round(distVals.reduce((a, b) => a + b, 0) / distVals.length)
    : null
  const distance_max = distVals.length > 0 ? Math.round(Math.max(...distVals)) : null

  const hard_hit_rate = pct(evVals.filter(ev => ev >= 95).length, n)
  const barrel_rate   = laVals.length === n
    ? pct(evVals.filter((ev, i) => ev >= 98 && laVals[i] >= 8 && laVals[i] <= 50).length, n)
    : null
  const sweet_spot_rate = laVals.length === n
    ? pct(laVals.filter(la => la >= 8 && la <= 32).length, n)
    : null

  let gb_rate = null, ld_rate = null, fb_rate = null
  if (hitTypes.length > 0) {
    const gb = hitTypes.filter(t => t.includes('ground')).length
    const ld = hitTypes.filter(t => t.includes('line')).length
    const fb = hitTypes.filter(t => t.includes('fly') || t.includes('popup')).length
    const tot = gb + ld + fb
    if (tot > 0) { gb_rate = pct(gb, tot); ld_rate = pct(ld, tot); fb_rate = pct(fb, tot) }
  } else if (laVals.length === n) {
    gb_rate = pct(laVals.filter(la => la < 10).length, n)
    ld_rate = pct(laVals.filter(la => la >= 10 && la <= 25).length, n)
    fb_rate = pct(laVals.filter(la => la > 25).length, n)
  }

  let pull_rate = null, oppo_rate = null
  if (dirVals.length > 0) {
    pull_rate = pct(dirVals.filter(d => d < -15).length, dirVals.length)
    oppo_rate = pct(dirVals.filter(d => d > 15).length, dirVals.length)
  }

  let contact_rate = null, whiff_rate = null
  const totalSwings = n + swingMisses
  if (totalSwings > 0 && swingMisses > 0) {
    contact_rate = pct(n, totalSwings)
    whiff_rate   = pct(swingMisses, totalSwings)
  }

  return {
    rowCount: n,
    ev_avg, ev_max, ev_90th,
    launch_angle_avg, distance_avg, distance_max,
    barrel_rate, hard_hit_rate, sweet_spot_rate,
    gb_rate, ld_rate, fb_rate,
    pull_rate, oppo_rate,
    contact_rate, whiff_rate,
  }
}

// ── Field definitions (organized in sections) ────────────────────────────────
type FieldDef = { key: keyof HittingMetrics; label: string; unit: string; desc: string }

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Exit Velocity & Power',
    fields: [
      { key: 'ev_avg',       label: 'Avg Exit Velo',   unit: 'mph', desc: 'Average speed of the ball off the bat this session' },
      { key: 'ev_max',       label: 'Max Exit Velo',   unit: 'mph', desc: 'Hardest single contact of the session' },
      { key: 'ev_90th',      label: '90th% Exit Velo', unit: 'mph', desc: 'Top 10% of balls hit — separates elite from average contact' },
      { key: 'distance_avg', label: 'Avg Distance',    unit: 'ft',  desc: 'Average projected distance of all batted balls' },
      { key: 'distance_max', label: 'Max Distance',    unit: 'ft',  desc: 'Furthest hit of the session — raw power ceiling' },
    ],
  },
  {
    title: 'Quality of Contact',
    fields: [
      { key: 'barrel_rate',      label: 'Barrel Rate',     unit: '%', desc: 'Balls hit with optimal EV + launch angle — elite contact %' },
      { key: 'hard_hit_rate',    label: 'Hard Hit %',      unit: '%', desc: 'Balls hit 95 mph or harder' },
      { key: 'sweet_spot_rate',  label: 'Sweet Spot %',    unit: '%', desc: 'Balls with launch angle 8–32° — the ideal trajectory window' },
      { key: 'launch_angle_avg', label: 'Avg Launch Angle',unit: '°', desc: 'Average degrees above horizontal. Elite = 8–20° range.' },
    ],
  },
  {
    title: 'Swing Mechanics',
    fields: [
      { key: 'bat_speed',    label: 'Bat Speed',    unit: 'mph', desc: 'Barrel speed through the contact zone' },
      { key: 'attack_angle', label: 'Attack Angle', unit: '°',  desc: 'How much the barrel travels upward through the zone. 5–15° is ideal.' },
    ],
  },
  {
    title: 'Batted Ball Profile',
    fields: [
      { key: 'gb_rate', label: 'Ground Ball %', unit: '%', desc: 'Percentage of batted balls on the ground' },
      { key: 'ld_rate', label: 'Line Drive %',  unit: '%', desc: 'Percentage of line drives — highest BABIP outcomes' },
      { key: 'fb_rate', label: 'Fly Ball %',    unit: '%', desc: 'Percentage of fly balls — power hitters trend higher' },
    ],
  },
  {
    title: 'Plate Discipline',
    fields: [
      { key: 'contact_rate', label: 'Contact %', unit: '%', desc: 'Swings that make contact — Tony Gwynn was over 90%' },
      { key: 'whiff_rate',   label: 'Whiff %',   unit: '%', desc: 'Swings and misses / total swings — lower = better bat-to-ball' },
      { key: 'pull_rate',    label: 'Pull %',    unit: '%', desc: 'Percentage of balls pulled (RHH: left field side)' },
      { key: 'oppo_rate',    label: 'Oppo %',    unit: '%', desc: 'Opposite field % — marker of a true two-way hitter' },
    ],
  },
]

function empty(): HittingMetrics {
  return {
    ev_avg: null, ev_max: null, ev_90th: null,
    distance_avg: null, distance_max: null,
    launch_angle_avg: null, barrel_rate: null,
    hard_hit_rate: null, sweet_spot_rate: null,
    attack_angle: null, bat_speed: null,
    gb_rate: null, ld_rate: null, fb_rate: null,
    pull_rate: null, oppo_rate: null,
    contact_rate: null, whiff_rate: null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HittingMetricsTab({
  clipId,
  role,
  initial,
}: {
  clipId: string
  role: 'coach' | 'player'
  initial: HittingMetrics | null
  canDelete?: boolean
  canEdit?: boolean
}) {
  const [metrics,   setMetrics]   = useState<HittingMetrics>(() => ({ ...empty(), ...(initial ?? {}) }))
  const [saveState, setSaveState] = useState<SaveState>(initial ? 'saved' : 'idle')
  const [error,     setError]     = useState<string | null>(null)
  const isCoach = role === 'coach'

  // CSV import state
  const fileRef  = useRef<HTMLInputElement>(null)
  type CsvPreview = Partial<HittingMetrics> & { rowCount: number }
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [csvError,   setCsvError]   = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    setCsvPreview(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string)
        const stats = computeStats(rows)
        if (stats.rowCount === 0) {
          setCsvError('No batted ball rows found. Check that your CSV has Exit Velocity / ExitSpeed / EV column headers.')
          return
        }
        setCsvPreview(stats)
      } catch {
        setCsvError('Could not parse the file. Make sure it\'s a CSV export from Trackman, Rapsodo, or HitTrax.')
      }
    }
    reader.readAsText(file)
  }

  function applyPreview() {
    if (!csvPreview) return
    const { rowCount: _rc, ...stats } = csvPreview
    void _rc
    setMetrics(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(stats)) {
        if (v != null) (next as Record<string, unknown>)[k] = v
      }
      return next
    })
    setSaveState('idle')
    setCsvPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

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
      setSaveState('saved')
    }
  }

  const hasAny = Object.values(metrics).some(v => v !== null)

  return (
    <div className="space-y-5">

      {/* ── CSV import (coach only) ─────────────────────────────────────────── */}
      {isCoach && (
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-4 space-y-3">
          <div>
            <p className="text-xs text-[#1C3A5C] tracking-widest" style={os}>Import Hitting Data</p>
            <p className="text-[10px] text-[#8096AE] mt-0.5">Works with any Trackman, Rapsodo, or HitTrax CSV export</p>
          </div>

          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-[#DDE4ED] rounded-md py-3 text-xs text-[#456080] hover:border-[#1C3A5C] hover:text-[#0F1F33] transition-colors"
          >
            <span className="block font-medium" style={os}>Upload CSV</span>
            <span className="block text-[10px] text-[#8096AE] mt-0.5">TrackMan · Rapsodo · HitTrax</span>
          </button>

          {csvError && <p className="text-xs text-[#C8102E]">{csvError}</p>}

          {csvPreview && csvPreview.rowCount > 0 && (
            <div className="rounded-lg border border-[#DDE4ED] overflow-hidden">
              <div className="px-3 py-2 bg-[#F0F4F8] border-b border-[#DDE4ED] flex items-center justify-between">
                <p className="text-[10px] text-[#1C3A5C]" style={os}>{csvPreview.rowCount} batted ball events parsed</p>
                <button
                  onClick={() => { setCsvPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-[10px] text-[#8096AE] hover:text-[#456080]"
                >
                  Discard
                </button>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2">
                {([
                  ['Avg EV',     csvPreview.ev_avg,          'mph'],
                  ['Max EV',     csvPreview.ev_max,          'mph'],
                  ['90th% EV',   csvPreview.ev_90th,         'mph'],
                  ['Avg Dist',   csvPreview.distance_avg,    'ft' ],
                  ['Max Dist',   csvPreview.distance_max,    'ft' ],
                  ['Avg LA',     csvPreview.launch_angle_avg,'°'  ],
                  ['Hard Hit',   csvPreview.hard_hit_rate,   '%'  ],
                  ['Barrel',     csvPreview.barrel_rate,     '%'  ],
                  ['Sweet Spot', csvPreview.sweet_spot_rate, '%'  ],
                  ['GB%',        csvPreview.gb_rate,         '%'  ],
                  ['LD%',        csvPreview.ld_rate,         '%'  ],
                  ['FB%',        csvPreview.fb_rate,         '%'  ],
                  ['Pull%',      csvPreview.pull_rate,       '%'  ],
                  ['Oppo%',      csvPreview.oppo_rate,       '%'  ],
                  ['Contact%',   csvPreview.contact_rate,    '%'  ],
                ] as [string, number | null | undefined, string][]).filter(([,v]) => v != null).map(([label, val, unit]) => (
                  <div key={label} className="text-center">
                    <p className="text-[9px] text-[#8096AE]" style={os}>{label}</p>
                    <p className="text-sm font-semibold text-[#1C3A5C]" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}>
                      {val}{unit}
                    </p>
                  </div>
                ))}
              </div>
              <div className="px-3 pb-3">
                <button
                  onClick={applyPreview}
                  className="w-full py-2 rounded-md text-xs text-white transition-colors"
                  style={{ ...os, background: '#1C3A5C' }}
                >
                  Apply to Form
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Header + quick save ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#1C3A5C]" style={os}>Hitting Data</p>
          <p className="text-[11px] text-[#8096AE] mt-0.5">Trackman / Rapsodo / HitTrax session stats</p>
        </div>
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

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      {SECTIONS.map(section => (
        <div key={section.title}>
          <p className="text-[9px] tracking-[0.25em] text-[#8096AE] mb-2" style={os}>{section.title}</p>
          <div className="grid grid-cols-2 gap-2.5">
            {section.fields.map(f => (
              <div key={f.key} className="bg-[#F8FAFC] border border-[#DDE4ED] rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#3D5166]" style={os}>{f.label}</p>
                  <span className="text-[9px] text-[#8096AE]" style={os}>{f.unit}</span>
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
        </div>
      ))}

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
