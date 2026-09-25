'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { updatePlayerAthleteProfile } from '@/app/actions/player'
import { COLLEGE_PROGRAMS } from '@/data/college-programs'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Tab = 'Videos' | 'Metrics' | 'AI Coach' | 'Coaching Notes' | 'Athlete Profile'
const TABS: Tab[] = ['Videos', 'Metrics', 'AI Coach', 'Coaching Notes', 'Athlete Profile']

interface Clip {
  id: string
  title: string
  created_at: string
  session_date: string | null
}

interface Metric {
  clip_id: string
  clip_title: string
  clip_date: string
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}

interface Note {
  clip_id: string
  clip_title: string
  clip_date: string
  body: string
  time_seconds: number | null
}

interface Showcase {
  name: string
  date: string
  location: string
}

interface AthleteProfile {
  height: string | null
  weight: string | null
  throws: string | null
  bats: string | null
  graduation_year: number | null
  high_school: string | null
  travel_team: string | null
  college_interests: string[] | null
  college_offers: string[] | null
  showcases: Showcase[] | null
  career_stats: Record<string, string> | null
}

interface Props {
  playerId: string
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
  clips: Clip[]
  metrics: Metric[]
  notes: Note[]
  athleteProfile: AthleteProfile
}

function fmtDate(sessionDate: string | null, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── AI Chat (player-level) ────────────────────────────────────────────────────
type Message = { role: 'user' | 'assistant'; content: string }

function PlayerAIChat({ playerName, ageGroup, position, metrics }: {
  playerName: string
  ageGroup: string | null
  position: string | null
  metrics: Metric[]
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streaming])

  async function generateSummary() {
    setSummaryLoading(true)
    const summaryPrompt = `Generate a concise development summary for ${playerName}. Based on their ${metrics.length} pitches tracked, identify: (1) strongest metrics, (2) areas for improvement, (3) 2-3 specific drills or focuses for the next session. Be direct and baseball-specific.`
    const next: Message[] = [...messages, { role: 'user', content: summaryPrompt }]
    setMessages(next)
    setLoading(true)
    setSummaryLoading(false)
    setStreaming('')

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: { playerName, ageGroup, position, clipId: null, viewerRole: 'coach', metrics: metrics.map(m => ({ pitch_type: m.pitch_type, velocity: m.velocity, spin_rate: m.spin_rate, spin_axis: m.spin_axis, horizontal_break: m.horizontal_break, vertical_break: m.vertical_break })) },
        }),
      })
      if (!res.ok || !res.body) throw new Error(`${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setStreaming(acc)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: acc }])
      setStreaming('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }])
      setStreaming('')
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setStreaming('')

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: {
            playerName,
            ageGroup,
            position,
            clipId: null,
            viewerRole: 'coach',
            metrics: metrics.map(m => ({
              pitch_type: m.pitch_type,
              velocity: m.velocity,
              spin_rate: m.spin_rate,
              spin_axis: m.spin_axis,
              horizontal_break: m.horizontal_break,
              vertical_break: m.vertical_break,
            })),
          },
        }),
      })
      if (!res.ok || !res.body) throw new Error(`${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setStreaming(acc)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: acc }])
      setStreaming('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }])
      setStreaming('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-[#DDE4ED]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#3D5166] tracking-widest" style={oswald}>AI Development Assistant</p>
            <p className="text-[11px] text-[#3D5166] mt-0.5">Ask about {playerName}&apos;s mechanics, progress, and what to work on next.</p>
          </div>
          {metrics.length > 0 && (
            <button
              onClick={generateSummary}
              disabled={loading || summaryLoading}
              className="text-[10px] bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              style={oswald}
            >
              {summaryLoading ? '…' : 'Session Summary'}
            </button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-4 space-y-3">
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-md px-3 py-2 text-sm text-[#456080] bg-[#F0F4F8] border border-[#DDE4ED]">
            Ask me about {playerName}&apos;s development — I have context from all {metrics.length > 0 ? `${metrics.length} pitch${metrics.length > 1 ? 'es' : ''} tracked` : 'their sessions'}. What do you want to know?
          </div>
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#C8102E] text-white' : 'bg-[#F0F4F8] border border-[#DDE4ED] text-[#456080]'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-md px-3 py-2 text-sm text-[#456080] bg-[#F0F4F8] border border-[#DDE4ED] whitespace-pre-wrap">
              {streaming || <span className="animate-pulse text-[#3D5166]">…</span>}
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-[#DDE4ED] p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about progress, mechanics, pitch design…"
          disabled={loading}
          className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-[#C8102E] hover:bg-[#A50D26] rounded-md text-sm text-white transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
let _sparklineId = 0
function Sparkline({ values, color, unit }: { values: number[]; color: string; unit: string }) {
  const [uid] = useState(() => ++_sparklineId)
  if (values.length < 2) return null
  const W = 260, H = 56, pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (W - pad * 2))
  const ys = values.map(v => H - pad - ((v - min) / range) * (H - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→'
  const trendColor = last > prev ? '#22c55e' : last < prev ? '#C8102E' : '#456080'
  const gradId = `g-${uid}`

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#3D5166]">{min}{unit} – {max}{unit}</span>
        <span className="text-xs font-mono" style={{ color: trendColor }}>{trend} {last}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${d} L${xs[xs.length-1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`}
          fill={`url(#${gradId})`}
        />
        <path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  )
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function MetricsSummary({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-[#3D5166]">No Rapsodo metrics uploaded yet.</p>
        <p className="text-xs text-[#3D5166] mt-2">Upload a CSV from a clip to start tracking pitch data.</p>
      </div>
    )
  }

  const byType: Record<string, Metric[]> = {}
  for (const m of metrics) {
    const key = m.pitch_type ?? 'Unknown'
    byType[key] = [...(byType[key] ?? []), m]
  }

  function avg(vals: (number | null)[]) {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }

  function nonNull(vals: (number | null)[]) {
    return vals.filter((x): x is number => x != null)
  }

  return (
    <div className="space-y-4">
      {metrics.length >= 3 && (() => {
        const veloSeries = nonNull(metrics.map(m => m.velocity))
        const spinSeries = nonNull(metrics.map(m => m.spin_rate))
        return (
          <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-[#DDE4ED]">
              <p className="text-sm text-[#0F1F33]" style={oswald}>Trend</p>
              <p className="text-xs text-[#3D5166] mt-0.5">All pitch types · chronological order</p>
            </div>
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#DDE4ED]">
              {veloSeries.length >= 3 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] text-[#3D5166] tracking-wide" style={oswald}>Velocity</p>
                  <Sparkline values={veloSeries} color="#C8102E" unit=" mph" />
                </div>
              )}
              {spinSeries.length >= 3 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] text-[#3D5166] tracking-wide" style={oswald}>Spin Rate</p>
                  <Sparkline values={spinSeries} color="#1C3A5C" unit=" rpm" />
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {Object.entries(byType).map(([type, ms]) => (
        <div key={type} className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#DDE4ED]">
            <p className="text-sm text-[#0F1F33]" style={oswald}>{type}</p>
            <span className="text-xs text-[#3D5166]">{ms.length} {ms.length === 1 ? 'pitch' : 'pitches'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#DDE4ED]">
            {[
              { label: 'Avg Velocity', val: avg(ms.map(m => m.velocity)), unit: 'mph' },
              { label: 'Avg Spin Rate', val: avg(ms.map(m => m.spin_rate)), unit: 'rpm' },
              { label: 'Horiz Break', val: avg(ms.map(m => m.horizontal_break)), unit: '"' },
              { label: 'Vert Break', val: avg(ms.map(m => m.vertical_break)), unit: '"' },
            ].map(({ label, val, unit }) => (
              <div key={label} className="bg-white px-4 py-3">
                <p className="text-[10px] text-[#3D5166] tracking-wide" style={oswald}>{label}</p>
                <p className="text-xl text-[#0F1F33] mt-1" style={oswald}>
                  {val != null ? `${val}` : '—'}
                  {val != null && <span className="text-xs text-[#3D5166] ml-1">{unit}</span>}
                </p>
              </div>
            ))}
          </div>
          {ms.length >= 3 && (() => {
            const vs = nonNull(ms.map(m => m.velocity))
            return vs.length >= 3 ? (
              <div className="px-4 py-3 border-t border-[#DDE4ED]">
                <p className="text-[10px] text-[#3D5166] tracking-wide mb-1" style={oswald}>Velocity Trend</p>
                <Sparkline values={vs} color="#C8102E" unit=" mph" />
              </div>
            ) : null
          })()}
        </div>
      ))}
    </div>
  )
}

// ── Athlete Profile Editor ────────────────────────────────────────────────────
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-lg px-3 py-2.5 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] transition-colors'
const labelClass = 'block text-xs text-[#456080] mb-1.5 tracking-wide'

const PITCH_STATS = [
  { key: 'era', label: 'ERA' }, { key: 'w', label: 'W' }, { key: 'l', label: 'L' },
  { key: 'ip', label: 'IP' }, { key: 'k', label: 'K' }, { key: 'bb', label: 'BB' },
  { key: 'whip', label: 'WHIP' }, { key: 'sv', label: 'SV' },
]
const HIT_STATS = [
  { key: 'avg', label: 'AVG' }, { key: 'obp', label: 'OBP' }, { key: 'slg', label: 'SLG' },
  { key: 'hr', label: 'HR' }, { key: 'rbi', label: 'RBI' }, { key: 'sb', label: 'SB' },
  { key: 'r', label: 'R' }, { key: 'h', label: 'H' },
]

function CollegePicker({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<string[]>([])

  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) { setResults([]); return }
    setResults(COLLEGE_PROGRAMS.filter(p => p.toLowerCase().includes(q)).slice(0, 10))
  }, [search])

  function toggle(p: string) {
    if (value.includes(p)) onChange(value.filter(x => x !== p))
    else onChange([...value, p])
  }

  return (
    <div>
      <label className={labelClass} style={oswald}>{label}</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map(p => (
            <span key={p} className="flex items-center gap-1 text-xs bg-[#1C3A5C] text-white px-2.5 py-1 rounded-full">
              {p}
              <button type="button" onClick={() => toggle(p)} className="opacity-60 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search programs…" className={inputClass} />
        {results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-[#DDE4ED] rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map(p => (
              <button key={p} type="button" onClick={() => { toggle(p); setSearch('') }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4F8] transition-colors ${value.includes(p) ? 'text-[#C8102E] font-medium' : 'text-[#0F1F33]'}`}>
                {value.includes(p) ? '✓ ' : ''}{p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AthleteProfileEditor({ playerId, initial }: { playerId: string; initial: AthleteProfile }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [interests, setInterests] = useState<string[]>(initial.college_interests ?? [])
  const [offers, setOffers] = useState<string[]>(initial.college_offers ?? [])
  const [showcases, setShowcases] = useState<Showcase[]>(initial.showcases ?? [])
  const [careerStats, setCareerStats] = useState<Record<string, string>>(initial.career_stats ?? {})

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function addShowcase() {
    setShowcases(prev => [...prev, { name: '', date: '', location: '' }])
  }
  function removeShowcase(i: number) {
    setShowcases(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateShowcase(i: number, field: keyof Showcase, val: string) {
    setShowcases(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updatePlayerAthleteProfile(playerId, {
      college_interests: interests,
      college_offers: offers,
      showcases: showcases.filter(s => s.name.trim()),
      career_stats: careerStats,
    })
    setSaving(false)
    if (result?.error) setError(result.error)
    else setSaved(true)
  }

  // Read-only display fields
  const infoFields = [
    { label: 'Height', value: initial.height },
    { label: 'Weight', value: initial.weight },
    { label: 'Throws', value: initial.throws },
    { label: 'Bats', value: initial.bats },
    { label: 'Grad Year', value: initial.graduation_year?.toString() ?? null },
    { label: 'High School', value: initial.high_school },
    { label: 'Travel Team', value: initial.travel_team },
  ].filter(f => f.value)

  const hasSomeStats = PITCH_STATS.some(s => careerStats[s.key]) || HIT_STATS.some(s => careerStats[s.key])

  return (
    <div className="space-y-5">
      {/* Physical / school info (read-only from player's own form) */}
      {infoFields.length > 0 && (
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#DDE4ED]">
            <p className="text-sm text-[#0F1F33]" style={oswald}>Physical Info</p>
            <p className="text-xs text-[#3D5166] mt-0.5">Updated by the player — view only</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#DDE4ED]">
            {infoFields.map(({ label, value }) => (
              <div key={label} className="bg-white px-4 py-3">
                <p className="text-[10px] text-[#3D5166] tracking-wide" style={oswald}>{label}</p>
                <p className="text-sm text-[#0F1F33] mt-1 font-medium">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editable: college recruiting */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm">
        <div className="h-1 bg-[#C8102E] rounded-t-xl" />
        <div className="p-5 space-y-5">
          <p className="text-[13px] text-[#C8102E] tracking-[0.2em]" style={oswald}>College Recruiting</p>
          <CollegePicker label="Schools Interested In" value={interests} onChange={setInterests} />
          <CollegePicker label="Offers Received" value={offers} onChange={setOffers} />
        </div>
      </div>

      {/* Editable: showcases */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#1C3A5C]" />
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[#1C3A5C] tracking-[0.2em]" style={oswald}>Upcoming Showcases</p>
            <button type="button" onClick={addShowcase} className="text-xs text-[#C8102E] hover:text-[#9E0E24] transition-colors" style={oswald}>+ Add</button>
          </div>
          {showcases.length === 0 && (
            <p className="text-xs text-[#3D5166]">No showcases added yet.</p>
          )}
          {showcases.map((s, i) => (
            <div key={i} className="grid sm:grid-cols-3 gap-3 p-3 bg-[#F8FAFC] rounded-lg border border-[#DDE4ED]">
              <div>
                <label className={labelClass} style={oswald}>Event Name</label>
                <input type="text" value={s.name} onChange={e => updateShowcase(i, 'name', e.target.value)} placeholder="e.g. Perfect Game National" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} style={oswald}>Date</label>
                <input type="text" value={s.date} onChange={e => updateShowcase(i, 'date', e.target.value)} placeholder="e.g. July 2025" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} style={oswald}>Location</label>
                <div className="flex gap-2">
                  <input type="text" value={s.location} onChange={e => updateShowcase(i, 'location', e.target.value)} placeholder="e.g. Marietta, GA" className={inputClass} />
                  <button type="button" onClick={() => removeShowcase(i)} className="text-xs text-[#3D5166] hover:text-[#C8102E] shrink-0 px-2">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editable: career stats */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#456080]" />
        <div className="p-5 space-y-5">
          <p className="text-[13px] text-[#456080] tracking-[0.2em]" style={oswald}>Career / Season Stats</p>

          <div>
            <p className="text-[10px] text-[#3D5166] tracking-widest mb-3" style={oswald}>Pitching</p>
            <div className="grid grid-cols-4 gap-3">
              {PITCH_STATS.map(({ key, label }) => (
                <div key={key}>
                  <label className={labelClass} style={oswald}>{label}</label>
                  <input type="text" value={careerStats[key] ?? ''} onChange={e => setCareerStats(prev => ({ ...prev, [key]: e.target.value }))} placeholder="—" className={inputClass} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-[#3D5166] tracking-widest mb-3" style={oswald}>Hitting</p>
            <div className="grid grid-cols-4 gap-3">
              {HIT_STATS.map(({ key, label }) => (
                <div key={key}>
                  <label className={labelClass} style={oswald}>{label}</label>
                  <input type="text" value={careerStats[key] ?? ''} onChange={e => setCareerStats(prev => ({ ...prev, [key]: e.target.value }))} placeholder="—" className={inputClass} />
                </div>
              ))}
            </div>
          </div>

          {!hasSomeStats && <p className="text-xs text-[#3D5166]">No stats entered yet. You or the player can add season totals or career stats here.</p>}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <span className="text-[#C8102E] text-sm">✕</span>
          <p className="text-sm text-[#C8102E]">{error}</p>
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <span className="text-green-600 text-sm">✓</span>
          <p className="text-sm text-green-700">Profile updated.</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-[#1C3A5C] hover:bg-[#223F63] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50"
        style={oswald}
      >
        {saving ? 'Saving…' : 'Save Athlete Profile'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileTabs({ playerName, playerAgeGroup, playerPosition, clips, metrics, notes, athleteProfile, playerId }: Props) {
  const [active, setActive] = useState<Tab>('Videos')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-[#DDE4ED] overflow-x-auto mb-5">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2.5 text-xs tracking-widest transition-colors border-b-2 -mb-px whitespace-nowrap ${
              active === tab
                ? 'border-[#C8102E] text-[#0F1F33]'
                : 'border-transparent text-[#3D5166] hover:text-[#456080]'
            }`}
            style={oswald}
          >
            {tab}
            {tab === 'Videos' && clips.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#EEF2F7] text-[#456080] px-1.5 py-0.5 rounded-full">
                {clips.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Videos */}
      {active === 'Videos' && (
        <>
          {clips.length === 0 ? (
            <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-[#3D5166]">No clips yet for this player.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#DDE4ED] rounded-xl divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
              {clips.map(clip => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F0F4F8] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-[#EEF2F7] border border-[#DDE4ED] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[#456080]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                    <span className="text-sm text-[#0F1F33] group-hover:text-[#1C3A5C] truncate">{clip.title}</span>
                  </div>
                  <span className="text-xs text-[#3D5166] shrink-0 ml-4">{fmtDate(clip.session_date, clip.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {active === 'Metrics' && <MetricsSummary metrics={metrics} />}

      {active === 'AI Coach' && (
        <PlayerAIChat
          playerName={playerName}
          ageGroup={playerAgeGroup}
          position={playerPosition}
          metrics={metrics}
        />
      )}

      {active === 'Coaching Notes' && (
        <>
          {notes.length === 0 ? (
            <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-[#3D5166]">No coaching notes yet.</p>
              <p className="text-xs text-[#3D5166] mt-2">Timestamp notes and text notes from clips will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note, i) => (
                <div key={i} className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[#DDE4ED] bg-[#F8FAFC]">
                    <Link href={`/clips/${note.clip_id}`} className="text-xs text-[#456080] hover:text-[#1C3A5C] transition-colors truncate max-w-xs" style={oswald}>
                      {note.clip_title}
                    </Link>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {note.time_seconds != null && (
                        <span className="text-[10px] font-mono bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded">
                          {fmtTime(note.time_seconds)}
                        </span>
                      )}
                      <span className="text-[10px] text-[#3D5166]">{note.clip_date}</span>
                    </div>
                  </div>
                  <p className="px-4 py-3 text-sm text-[#0F1F33] whitespace-pre-wrap leading-relaxed">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {active === 'Athlete Profile' && (
        <AthleteProfileEditor playerId={playerId} initial={athleteProfile} />
      )}
    </div>
  )
}
