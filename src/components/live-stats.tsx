'use client'

import { useEffect, useRef, useState } from 'react'

interface StatDef { value: number; suffix: string; label: string; color: string; decimals?: number }

const STATS: StatDef[] = [
  { value: 93,   suffix: '',   label: 'MPH Top Velo',   color: '#E8102A', decimals: 0 },
  { value: 2480, suffix: '',   label: 'RPM Spin Rate',  color: '#3B82F6', decimals: 0 },
  { value: 18.2, suffix: '"',  label: 'Vertical Break', color: '#10B981', decimals: 1 },
]

function Counter({ value, suffix, decimals = 0, color }: StatDef) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return
      started.current = true
      const duration = 1400
      const fps = 60
      const steps = (duration / 1000) * fps
      const increment = value / steps
      let current = 0
      const tick = () => {
        current += increment
        if (current >= value) { setDisplay(value); return }
        setDisplay(current)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.floor(display).toLocaleString()

  return (
    <span ref={ref} style={{ color, fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}>
      {formatted}{suffix}
    </span>
  )
}

export default function LiveStats() {
  return (
    <div className="flex gap-8 sm:gap-12 flex-wrap">
      {STATS.map(s => (
        <div key={s.label}>
          <div className="text-[clamp(32px,5vw,52px)] leading-none font-bold tracking-tight">
            <Counter {...s} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 tracking-[0.2em] uppercase">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
