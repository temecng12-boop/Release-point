'use client'

import Link from 'next/link'
import { formatPositionLabels, resolvePlayerPositions } from '@/lib/positions'

interface Props {
  player: {
    id: string
    full_name: string
    accepted_at: string | null
    age_group: string | null
    position: string | null
    positions?: string[] | null
  }
  clipCount: number
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function PlayerCard({ player, clipCount }: Props) {
  return (
    <Link
      href={`/profile/${player.id}`}
      className="rp-roster-card flex items-center gap-3 bg-white border rounded-lg px-4 py-3 transition-all shadow-sm group cursor-pointer max-sm:min-h-11"
      aria-label={`Open ${player.full_name}'s profile`}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-xs text-white shrink-0"
        style={{ background: 'linear-gradient(to bottom right, var(--rp-navy, #023167), #456080)', fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
      >
        {initials(player.full_name)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0F1F33] group-hover:text-[color:var(--rp-navy,#023167)] truncate font-medium">
          {player.full_name}
        </p>
        <p className="text-[11px] text-[#3D5166] truncate capitalize">
          {[formatPositionLabels(resolvePlayerPositions(player)) || null, player.age_group].filter(Boolean).join(' · ') || 'No details yet'}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-[#3D5166]">{clipCount} {clipCount === 1 ? 'clip' : 'clips'}</span>
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${player.accepted_at ? 'bg-green-400' : 'bg-[#DDE4ED]'}`}
          title={player.accepted_at ? 'Active' : 'Not yet signed up'}
        />
      </div>
    </Link>
  )
}
