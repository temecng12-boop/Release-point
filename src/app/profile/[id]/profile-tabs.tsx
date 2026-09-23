'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Tab = 'Videos' | 'Metrics' | 'AI Coach' | 'Coaching Notes'
const TABS: Tab[] = ['Videos', 'Metrics', 'AI Coach', 'Coaching Notes']

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

interface Props {
  playerId: string
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
  clips: Clip[]
  metrics: Metric[]
  notes: Note[]
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

// ── Inline sparkline chart ────────────────────────────────────────────────────
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

// ── Metrics aggregation ───────────────────────────────────────────────────────
function MetricsSummary({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-[#3D5166]">No Rapsodo metrics uploaded yet.</p>
        <p className="text-xs text-[#3D5166] mt-2">Upload a CSV from a clip to start tracking pitch data.</p>
      </div>
    )
  }

  // Group by pitch type
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
      {/* Trend charts for all pitches combined */}
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

      {/* Per-pitch-type breakdowns */}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileTabs({ playerName, playerAgeGroup, playerPosition, clips, metrics, notes }: Props) {
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

      {/* Metrics */}
      {active === 'Metrics' && <MetricsSummary metrics={metrics} />}

      {/* AI Coach */}
      {active === 'AI Coach' && (
        <PlayerAIChat
          playerName={playerName}
          ageGroup={playerAgeGroup}
          position={playerPosition}
          metrics={metrics}
        />
      )}

      {/* Coaching Notes */}
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
    </div>
  )
}
