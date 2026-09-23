'use client'

import { useState } from 'react'
import Link from 'next/link'
import UploadButton from './upload-button'
import RecordButton from './record-button'
import EditPlayerModal from './edit-player-modal'
import { deleteClip } from '@/app/actions/clips'

interface Clip {
  id: string
  title: string
  created_at: string
  session_date?: string | null
}

interface Team { id: string; name: string }

interface Player {
  id: string
  full_name: string
  email: string
  accepted_at: string | null
  age_group: string | null
  position: string | null
  consent_given_at: string | null
  teamIds: string[]
}

interface Props {
  player: Player
  clips: Clip[]
  teams: Team[]
}

function fmtDate(sessionDate: string | null | undefined, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlayerRow({ player, clips, teams }: Props) {
  const [editOpen, setEditOpen]         = useState(false)
  const [confirmClip, setConfirmClip]   = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<string | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)

  async function handleDeleteClip(clipId: string) {
    setDeletingClip(clipId)
    setDeleteError(null)
    const result = await deleteClip(clipId)
    setDeletingClip(null)
    if (result?.error) {
      setDeleteError(result.error)
    } else {
      setConfirmClip(null)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
        {/* Player header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#DDE4ED]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${player.id}`}
                className="text-sm font-medium text-[#0F1F33] hover:text-[#1C3A5C] hover:underline"
              >
                {player.full_name}
              </Link>
              {player.age_group && (
                <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full">
                  {player.age_group}
                </span>
              )}
              {player.position && (
                <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full capitalize">
                  {player.position}
                </span>
              )}
            </div>
            <p className="text-xs text-[#456080] mt-0.5">{player.email}</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-2 sm:ml-3 shrink-0">
            <span
              className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded-md uppercase tracking-wide ${
                player.accepted_at
                  ? 'bg-green-100 text-green-700'
                  : 'bg-[#EEF2F7] text-[#456080]'
              }`}
              style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
            >
              {player.accepted_at ? 'Joined' : 'Invited'}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="text-[10px] sm:text-xs bg-[#EEF2F7] hover:bg-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors border border-[#DDE4ED]"
            >
              Edit
            </button>
            <RecordButton playerId={player.id} playerName={player.full_name} consentGiven={!!player.consent_given_at} />
            <UploadButton playerId={player.id} playerName={player.full_name} consentGiven={!!player.consent_given_at} />
          </div>
        </div>

        {/* Clips list */}
        {clips.length === 0 ? (
          <p className="text-xs text-[#3D5166] px-4 py-2">No clips yet.</p>
        ) : (
          <ul className="divide-y divide-[#DDE4ED]">
            {clips.map((clip) => (
              <li key={clip.id}>
                {confirmClip === clip.id ? (
                  <div className="flex items-center justify-between px-4 py-2 bg-[#FFF5F5]">
                    <span className="text-xs text-[#456080]">
                      {deleteError ?? `Delete "${clip.title}"?`}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteClip(clip.id)}
                        disabled={deletingClip === clip.id}
                        className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {deletingClip === clip.id ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => { setConfirmClip(null); setDeleteError(null) }}
                        className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2 hover:bg-[#F0F4F8] transition-colors group">
                    <Link href={`/clips/${clip.id}`} className="flex-1 flex items-center justify-between">
                      <span className="text-sm text-[#0F1F33]">{clip.title}</span>
                      <span className="text-xs text-[#456080]">{fmtDate(clip.session_date, clip.created_at)}</span>
                    </Link>
                    <button
                      onClick={() => setConfirmClip(clip.id)}
                      className="ml-3 text-[#3D5166] hover:text-[#C8102E] opacity-0 group-hover:opacity-100 transition-all text-xs leading-none shrink-0"
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
          teams={teams}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}
