import { formatPositionLabels, resolvePlayerPositions, type PositionSource } from '@/lib/positions'

/** Read-only chips for roster / profile / guardian lists. */
export default function PositionTags({
  player,
  className = 'text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full',
}: {
  player: PositionSource | null | undefined
  className?: string
}) {
  const labels = formatPositionLabels(resolvePlayerPositions(player))
  if (!labels) return null
  return <span className={className}>{labels}</span>
}
