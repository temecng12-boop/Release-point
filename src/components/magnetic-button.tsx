'use client'

import { useRef, useCallback } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

const SPRING = { stiffness: 380, damping: 28 }
const PULL   = 0.32 // how strongly the button follows the cursor

interface Props {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/** Wraps any element with a magnetic-pull hover and spring press. */
export default function MagneticButton({ children, className = '', style }: Props) {
  const ref  = useRef<HTMLDivElement>(null)
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, SPRING)
  const y = useSpring(rawY, SPRING)

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    rawX.set((e.clientX - (rect.left + rect.width  / 2)) * PULL)
    rawY.set((e.clientY - (rect.top  + rect.height / 2)) * PULL)
  }, [rawX, rawY])

  const handleLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
  }, [rawX, rawY])

  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-block', ...style }}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {children}
    </motion.div>
  )
}
