import { AGE_STOP_MESSAGE } from '@/lib/stop-message'

// Shown after an age answer that stops signup or freezes the account (hard
// stop, src/lib/under13-mode.ts). No copy here names the age cutoff.
export default function AgeStopNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div role="alert" data-testid="age-stop" className={`rounded-lg border border-amber-200 bg-amber-50 ${compact ? 'px-3 py-2' : 'px-4 py-4'}`}>
      <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-amber-900`}>{AGE_STOP_MESSAGE}</p>
    </div>
  )
}
