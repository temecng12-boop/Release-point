'use client'

import { useState } from 'react'
import Link from 'next/link'

type Clip = {
  id: string
  title: string
  created_at: string
  session_date: string | null
  player_id: string
}

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const PAGE = 20

function fmtClipDate(clip: Clip) {
  if (clip.session_date) {
    return new Date(clip.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return new Date(clip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityFeed({
  clips,
  playerNameMap,
  totalClips,
}: {
  clips: Clip[]
  playerNameMap: Record<string, string | null>
  totalClips: number
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Unique players who have clips, sorted by most recent clip
  const playerOrder = [...new Set(clips.map(c => c.player_id))]
  const players = playerOrder
    .map(id => ({ id, name: playerNameMap[id] ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const filtered = selectedPlayer ? clips.filter(c => c.player_id === selectedPlayer) : clips
  const visible = showAll ? filtered : filtered.slice(0, PAGE)
  const firstClipId = clips[0]?.id

  function selectPlayer(id: string | null) {
    setSelectedPlayer(id)
    setShowAll(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-[0.25em] text-[#E8102A]" style={os}>Recent Activity</p>
        <span className="text-[11px] text-slate-400" style={os}>{totalClips} total clips</span>
      </div>

      {/* Player filter pills — only shown when there are multiple players */}
      {players.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3 overflow-x-auto pb-0.5">
          <button
            onClick={() => selectPlayer(null)}
            className={`text-[10px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 transition-colors ${
              !selectedPlayer
                ? 'bg-[#E8102A] border-[#E8102A] text-white'
                : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700'
            }`}
            style={os}
          >
            All
          </button>
          {players.map(p => (
            <button
              key={p.id}
              onClick={() => selectPlayer(p.id)}
              className={`text-[10px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 transition-colors ${
                selectedPlayer === p.id
                  ? 'bg-[#0F1F33] border-[#0F1F33] text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700'
              }`}
              style={os}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl px-5 py-8 text-center text-sm text-slate-400" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          No clips yet for this player
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          {visible.map((clip, i) => (
            <Link
              key={clip.id}
              href={`/clips/${clip.id}`}
              className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
              style={{ borderBottom: i < visible.length - 1 ? '1px solid #f1f5f9' : undefined }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100">
                <svg className="w-3.5 h-3.5 text-[#E8102A]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-slate-700 truncate group-hover:text-slate-950 transition-colors">{clip.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {playerNameMap[clip.player_id] ?? 'Unknown'} · {fmtClipDate(clip)}
                </p>
              </div>
              {clip.id === firstClipId && (
                <span className="text-[10px] bg-[#E8102A] text-white px-2 py-0.5 rounded shrink-0" style={os}>New</span>
              )}
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {!showAll && filtered.length > PAGE && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full text-[11px] text-slate-400 hover:text-slate-600 py-2 transition-colors"
          style={os}
        >
          Show {filtered.length - PAGE} more →
        </button>
      )}
    </div>
  )
}
