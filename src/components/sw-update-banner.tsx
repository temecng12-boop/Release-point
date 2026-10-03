'use client'

import { useEffect, useState } from 'react'
import { watchSwUpdate } from '@/lib/sw-update'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// "New version available – Reload". Shown when a new service worker takes
// over; reloads only when tapped, and can be dismissed.
export default function SwUpdateBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    return watchSwUpdate(navigator.serviceWorker, () => setShow(true))
  }, [])

  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pointer-events-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto flex items-center gap-3 w-full max-w-md rounded-lg bg-[#0F1F33] text-white shadow-lg pl-4 pr-2 py-2">
        <p className="flex-1 text-sm">New version available</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 px-4 rounded-md bg-[#C8102E] hover:bg-[#A50D26] text-sm tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={oswald}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="min-h-11 min-w-11 rounded-md text-white/70 hover:text-white text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ×
        </button>
      </div>
    </div>
  )
}
