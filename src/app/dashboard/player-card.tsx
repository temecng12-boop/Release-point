'use client'

import Link from 'next/link'

interface Props {
  player: {
    id: string
    full_name: string
    accepted_at: string | null
    age_group: string | null
    position: string | null
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
      className="flex items-center gap-3 bg-white border border-[#DDE4ED] rounded-lg px-4 py-3 hover:bg-[#F0F4F8] hover:border-[#456080] transition-all shadow-sm group cursor-pointer"
    >
      <div
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1C3A5C] to-[#456080] flex items-center justify-center text-xs text-white shrink-0"
        style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
      >
        {initials(player.full_name)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0F1F33] group-hover:text-[#1C3A5C] truncate font-medium">
          {player.full_name}
        </p>
        <p className="text-[11px] text-[#3D5166] truncate capitalize">
          {[player.position, player.age_group].filter(Boolean).join(' · ') || 'No details yet'}
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
