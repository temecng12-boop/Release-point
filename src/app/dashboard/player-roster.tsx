'use client'

import { useMemo, useState } from 'react'
import PlayerCard from './player-card'

interface Player {
  id: string
  full_name: string
  accepted_at: string | null
  age_group: string | null
  position: string | null
  teamIds: string[]
}

interface Team { id: string; name: string; age_group: string | null }

interface Props {
  players: Player[]
  teams: Team[]
  clipCounts: Record<string, number>
}

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function PlayerRoster({ players, teams, clipCounts }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter(p =>
      p.full_name.toLowerCase().includes(q) ||
      (p.position ?? '').toLowerCase().includes(q) ||
      (p.age_group ?? '').toLowerCase().includes(q)
    )
  }, [players, search])

  const teamsWithPlayers = teams.map(team => ({
    ...team,
    players: filtered.filter(p => p.teamIds.includes(team.id)),
  }))

  const unassigned = filtered.filter(p => p.teamIds.length === 0)

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search players by name, position, or level…"
          className="w-full bg-white border border-[#DDE4ED] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] shadow-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3D5166] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Per-team groups */}
      {teamsWithPlayers.map(team => {
        if (search && team.players.length === 0) return null
        return (
          <div key={team.id}>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>{team.name}</p>
              {team.age_group && (
                <span className="text-[10px] border border-[#DDE4ED] text-[#456080] px-2 py-0.5 rounded" style={oswald}>
                  {team.age_group}
                </span>
              )}
              <span className="text-[10px] text-[#3D5166]">· {team.players.length} {team.players.length === 1 ? 'player' : 'players'}</span>
            </div>

            {team.players.length === 0 ? (
              <p className="text-xs text-[#3D5166] italic px-1">No players on this team yet.</p>
            ) : (
              <div className="grid gap-2">
                {team.players.map(p => (
                  <PlayerCard key={p.id} player={p} clipCount={clipCounts[p.id] ?? 0} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#3D5166] mb-2" style={oswald}>
            Unassigned · {unassigned.length}
          </p>
          <div className="grid gap-2">
            {unassigned.map(p => (
              <PlayerCard key={p.id} player={p} clipCount={clipCounts[p.id] ?? 0} />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && search && (
        <div className="text-center py-10">
          <p className="text-sm text-[#3D5166]">No players match &ldquo;{search}&rdquo;</p>
        </div>
      )}
    </div>
  )
}
