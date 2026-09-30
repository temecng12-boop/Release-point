'use client'

import { useEffect } from 'react'
import { installSwReload, pageIsBusy, trackRecorders } from '@/lib/sw-reload'

// Reloads the page once when a new service worker takes over (see src/lib/sw-reload.ts).
export default function SwUpdateReload() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const active = new Set<{ state?: string; addEventListener(t: string, f: () => void): void }>()
    if (typeof MediaRecorder !== 'undefined') trackRecorders(MediaRecorder.prototype as never, active)
    let storage: Storage | null = null
    try { storage = window.sessionStorage } catch { storage = null }
    return installSwReload({
      sw: navigator.serviceWorker,
      storage,
      now: () => Date.now(),
      isBusy: () => pageIsBusy(document, [...active].filter(r => r.state !== 'inactive').length),
      reload: () => window.location.reload(),
      setTimeout: (f, ms) => window.setTimeout(f, ms),
      clearTimeout: h => window.clearTimeout(h as number),
    })
  }, [])
  return null
}
