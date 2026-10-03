import Link from 'next/link'
import AgeBandConfirm from '@/app/dashboard/age-band-confirm'
import MarkAdultButton from '@/app/dashboard/mark-adult-button'
import { pendingBannerLines, type PendingPlayer } from '@/lib/pending-players'

// Coach dashboard and team roster: one banner listing the coach's players who
// can't have video yet. Players with no band get a one-tap age confirm;
// under-13 players get the "parent consent is coming soon" note. Gone once
// every player is resolved (renders nothing). Same amber style as UploadBlockedNotice.
export default function PendingPlayersBanner({ players }: { players: PendingPlayer[] }) {
  if (players.length === 0) return null
  return (
    <div role="status" data-testid="pending-players-banner" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left">
      {pendingBannerLines(players).map((line) => (
        <p key={line} className="text-xs font-medium text-amber-900">{line}</p>
      ))}
      <ul className="mt-2 divide-y divide-amber-200">
        {players.map((p) => (
          <li key={p.id} className="py-2 flex flex-col gap-1.5" data-testid="pending-player">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/profile/${p.id}`} className="text-xs font-medium text-amber-900 hover:underline max-sm:inline-flex max-sm:items-center max-sm:min-h-11">
                {p.full_name}
              </Link>
              <span className="text-xs bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-full">
                {p.reason === 'under_13' ? 'Under 13 · parent consent coming soon' : 'Needs age'}
              </span>
            </div>
            {p.reason === 'under_13' ? null : p.bandsAvailable ? (
              <AgeBandConfirm playerId={p.id} playerName={p.full_name} />
            ) : (
              <MarkAdultButton playerId={p.id} playerName={p.full_name} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
