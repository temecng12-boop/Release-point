import { AGE_STOP_MESSAGE } from '@/lib/stop-message'

/**
 * Shown after an age answer that stops signup or freezes the account (hard
 * stop, src/lib/under13-mode.ts). No copy here names the age cutoff.
 * Default (non-compact) is large and high-contrast so it can't be missed on
 * the one-screen signup stop and the OAuth-before-buttons age path.
 */
export default function AgeStopNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div role="alert" data-testid="age-stop" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
        <p className="text-xs font-medium text-amber-950">{AGE_STOP_MESSAGE}</p>
      </div>
    )
  }
  return (
    <div
      role="alert"
      data-testid="age-stop"
      className="rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-6 sm:px-6 sm:py-8 text-center shadow-sm"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-200 text-amber-900" aria-hidden>
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <p className="text-lg sm:text-xl font-semibold text-amber-950 leading-snug" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}>
        {AGE_STOP_MESSAGE}
      </p>
    </div>
  )
}
