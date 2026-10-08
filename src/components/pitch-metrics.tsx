'use client'

import { useEffect, useRef, useState } from 'react'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Metric {
  label: string
  pct: number
  color: string
  num: number | null
  prefix: string
  suffix: string
  decimals: number
  fixed?: string
}

const METRICS: Metric[] = [
  { label: 'Velocity',  pct: 80, color: '#E8102A', num: 89,    prefix: '',  suffix: ' mph',  decimals: 0 },
  { label: 'Spin Rate', pct: 68, color: '#3B82F6', num: 2248,  prefix: '',  suffix: ' rpm',  decimals: 0 },
  { label: 'IVB',       pct: 88, color: '#10B981', num: 18.7,  prefix: '+', suffix: '"',     decimals: 1 },
  { label: 'H-Break',   pct: 62, color: '#8B5CF6', num: 8.1,   prefix: '+', suffix: '"',     decimals: 1 },
  { label: 'Spin Axis', pct: 55, color: '#F59E0B', num: null,  prefix: '',  suffix: '',      decimals: 0, fixed: '1:00' },
  { label: 'Extension', pct: 74, color: '#06B6D4', num: 6.4,   prefix: '',  suffix: ' ft',   decimals: 1 },
  { label: 'VAA',       pct: 70, color: '#EC4899', num: 4.2,   prefix: '-', suffix: '°',     decimals: 1 },
]

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setActive(true); obs.disconnect() }
    }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, active }
}

function CountUp({ m, active }: { m: Metric; active: boolean }) {
  // Start at the real number so the server-rendered HTML (and no-JS) shows
  // it; the count-up below replays from zero once the card scrolls into view.
  const [display, setDisplay] = useState(m.num ?? 0)
  const started = useRef(false)

  useEffect(() => {
    if (!active || started.current || m.num === null) return
    started.current = true
    const target = m.num
    const duration = 1200
    const steps = (duration / 1000) * 60
    const inc = target / steps
    let cur = 0
    setDisplay(0)
    const tick = () => {
      cur += inc
      if (cur >= target) { setDisplay(target); return }
      setDisplay(cur)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [active, m.num])

  if (m.fixed) return <span className="text-[10px] font-mono text-slate-700 font-medium">{m.fixed}</span>

  const formatted = m.decimals > 0
    ? display.toFixed(m.decimals)
    : Math.floor(display).toLocaleString()

  return (
    <span className="text-[10px] font-mono text-slate-700 font-medium">
      {m.prefix}{formatted}{m.suffix}
    </span>
  )
}

export default function PitchMetrics() {
  const { ref, active } = useScrollReveal()

  return (
    <div ref={ref} className="space-y-2.5 mt-2">
      {METRICS.map((m, i) => (
        <div key={m.label}>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-slate-500" style={os}>{m.label}</span>
            <CountUp m={m} active={active} />
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: active ? `${m.pct}%` : '0%',
                backgroundColor: m.color,
                transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
