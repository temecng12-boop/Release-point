'use client'

import { useEffect } from 'react'
import Logo from '@/components/Logo'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <header
        className="flex items-center px-5 h-14 border-b border-[#DDE4ED]"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}
      >
        <Logo size="sm" href="/" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] text-[#C8102E] tracking-[0.3em] mb-3" style={oswald}>Error</p>
        <h1 className="text-4xl text-[#0F1F33] mb-4 leading-none" style={oswald}>Something went wrong</h1>
        <p className="text-sm text-[#3D5166] mb-8 max-w-xs">
          An unexpected error occurred. Try again or head back to the dashboard.
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="bg-[#C8102E] hover:bg-[#9E0E24] text-white px-6 py-3 rounded-lg text-sm transition-colors"
            style={oswald}
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="border border-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-6 py-3 rounded-lg text-sm transition-colors"
            style={oswald}
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
