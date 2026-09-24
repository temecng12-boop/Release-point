'use client'

import { useRef, useState, useCallback } from 'react'

interface Props {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function SpotlightCard({ children, className = '', style }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0, visible: false })

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true })
  }, [])

  const handleLeave = useCallback(() => {
    setPos(p => ({ ...p, visible: false }))
  }, [])

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={style}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: pos.visible ? 1 : 0,
          background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(0,0,0,0.04), transparent 70%)`,
        }}
      />
      {children}
    </div>
  )
}
