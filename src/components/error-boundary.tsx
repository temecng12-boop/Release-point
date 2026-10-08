'use client'

import * as Sentry from '@sentry/nextjs'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function Fallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg overflow-hidden border border-[#DDE4ED]">
        <div className="h-1 bg-[#C8102E]" />
        <div className="px-6 py-8 text-center space-y-4">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={os}>Release Point</p>
          <h1 className="text-xl text-[#0F1F33]" style={os}>Something went wrong</h1>
          <p className="text-sm text-[#456080] leading-relaxed">
            We&apos;ve been notified and are on it. Try reloading the page.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-red-500 font-mono text-left bg-red-50 rounded p-3 break-words">
              {error.message}
            </p>
          )}
          <button
            onClick={resetError}
            className="w-full py-2.5 rounded-lg text-sm text-white"
            style={{ ...os, background: '#C8102E' }}
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
      <Fallback error={error as Error} resetError={resetError} />
    )}>
      {children}
    </Sentry.ErrorBoundary>
  )
}
