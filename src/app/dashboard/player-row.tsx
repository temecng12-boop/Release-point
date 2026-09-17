'use client'

import { useState } from 'react'
import Link from 'next/link'
import UploadButton from './upload-button'
import EditPlayerModal from './edit-player-modal'
import { deleteClip } from '@/app/actions/clips'

interface Clip {
  id: string
  title: string
  created_at: string
  session_date?: string | null
}

interface Player {
  id: string
  full_name: string
  email: string
  accepted_at: string | null
  age_group: string | null
  position: string | null
  consent_given_at: string | null
}

interface Props {
  player: Player
  clips: Clip[]
}

function fmtDate(sessionDate: string | null | undefined, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlayerRow({ player, clips }: Props) {
  const [editOpen, setEditOpen]         = useState(false)
  const [confirmClip, setConfirmClip]   = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<string | null>(null)

  async function handleDeleteClip(clipId: string) {
    setDeletingClip(clipId)
    await deleteClip(clipId)
    setDeletingClip(null)
    setConfirmClip(null)
  }

  return (
    <>
      <div className="bg-[#0B1E36] rounded-xl border border-[#1C3A5C] overflow-hidden">
        {/* Player header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1C3A5C]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${player.id}`}
                className="text-sm font-medium text-[#E8EDF5] hover:text-white hover:underline"
              >
                {player.full_name}
              </Link>
              {player.age_group && (
                <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full">
                  {player.age_group}
                </span>
              )}
              {player.position && (
                <span className="text-xs bg-[#1C3A5C] text-[#9FB3CC] px-2 py-0.5 rounded-full capitalize">
                  {player.position}
                </span>
              )}
            </div>
            <p className="text-xs text-[#9FB3CC] mt-0.5">{player.email}</p>
          </div>

          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 rounded-md uppercase tracking-wide ${
                player.accepted_at
                  ? 'bg-green-900/40 text-green-400'
                  : 'bg-[#1C3A5C] text-[#9FB3CC]'
              }`}
              style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
            >
              {player.accepted_at ? 'Joined' : 'Invited'}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-[#9FB3CC] hover:text-white px-3 py-1.5 rounded-md transition-colors"
            >
              Edit
            </button>
            <UploadButton playerId={player.id} playerName={player.full_name} consentGiven={!!player.consent_given_at} />
          </div>
        </div>

        {/* Clips list */}
        {clips.length === 0 ? (
          <p className="text-xs text-[#4A6880] px-4 py-2">No clips yet.</p>
        ) : (
          <ul className="divide-y divide-[#1C3A5C]">
            {clips.map((clip) => (
              <li key={clip.id}>
                {confirmClip === clip.id ? (
                  <div className="flex items-center justify-between px-4 py-2 bg-[#0F2030]">
                    <span className="text-xs text-[#9FB3CC]">Delete &ldquo;{clip.title}&rdquo;?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteClip(clip.id)}
                        disabled={deletingClip === clip.id}
                        className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {deletingClip === clip.id ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmClip(null)}
                        className="text-xs text-[#9FB3CC] hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2 hover:bg-[#112940] transition-colors group">
                    <Link href={`/clips/${clip.id}`} className="flex-1 flex items-center justify-between">
                      <span className="text-sm text-[#E8EDF5]">{clip.title}</span>
                      <span className="text-xs text-[#9FB3CC]">{fmtDate(clip.session_date, clip.created_at)}</span>
                    </Link>
                    <button
                      onClick={() => setConfirmClip(clip.id)}
                      className="ml-3 text-[#4A6880] hover:text-[#C8102E] opacity-0 group-hover:opacity-100 transition-all text-xs leading-none shrink-0"
                      title="Delete clip"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && (
        <EditPlayerModal
          player={player}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}
