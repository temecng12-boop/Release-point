import { UNDER_13_STOP_MESSAGE } from '@/lib/under13-mode'

// Shown after an under-13 answer (hard stop, src/lib/under13-mode.ts).
export default function Under13Stop({ compact = false }: { compact?: boolean }) {
  return (
    <div role="alert" data-testid="under13-stop" className={`rounded-lg border border-amber-200 bg-amber-50 ${compact ? 'px-3 py-2' : 'px-4 py-4'}`}>
      <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-amber-900`}>{UNDER_13_STOP_MESSAGE}</p>
    </div>
  )
}
