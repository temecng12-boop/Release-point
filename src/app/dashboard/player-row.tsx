'use client'

import { useState } from 'react'
import Link from 'next/link'
import UploadButton from './upload-button'
import RecordButton from './record-button'
import EditPlayerModal from './edit-player-modal'
import BullpenModal from './bullpen-modal'
import type { BullpenSession } from './bullpen-modal'
import { deleteClip } from '@/app/actions/clips'
import { resendPlayerInvite } from '@/app/actions/invite'

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
  sessions: BullpenSession[]
}

function fmtDate(sessionDate: string | null | undefined, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlayerRow({ player, clips, teams, sessions }: Props) {
  const [editOpen, setEditOpen]         = useState(false)
  const [bullpenOpen, setBullpenOpen]   = useState(false)
  const [confirmClip, setConfirmClip]   = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<string | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [resending, setResending]       = useState(false)
  const [resendMsg, setResendMsg]       = useState<string | null>(null)

  async function handleResendInvite() {
    setResending(true)
    setResendMsg(null)
    const result = await resendPlayerInvite(player.id)
    setResending(false)
    setResendMsg(result.success ?? result.error ?? null)
    if (result.success) setTimeout(() => setResendMsg(null), 4000)
  }

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

          <div className="flex flex-wrap items-center justify-end gap-1.5 ml-2 shrink-0 max-w-[180px] sm:max-w-none">
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
            {!player.accepted_at && (
              <button
                onClick={handleResendInvite}
                disabled={resending}
                title="Resend invite email"
                className="hidden sm:inline-block text-[10px] text-[#456080] hover:text-[#C8102E] border border-[#DDE4ED] hover:border-[#C8102E] px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
                style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
              >
                {resending ? '…' : 'Resend'}
              </button>
            )}
            {resendMsg && (
              <span className="hidden sm:inline-block text-[10px] text-green-600" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}>
                {resendMsg}
              </span>
            )}
            <button
              onClick={() => setEditOpen(true)}
              className="text-[10px] sm:text-xs bg-[#EEF2F7] hover:bg-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors border border-[#DDE4ED]"
            >
              Edit
            </button>
            <button
              onClick={() => setBullpenOpen(true)}
              title="Log a bullpen session"
              className="hidden sm:flex text-[10px] sm:text-xs bg-[#EEF2F7] hover:bg-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors border border-[#DDE4ED] whitespace-nowrap items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#1C3A5C] shrink-0" />
              Bullpen
              {sessions.length > 0 && (
                <span className="text-[9px] bg-[#1C3A5C] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">{sessions.length}</span>
              )}
            </button>
            <RecordButton playerId={player.id} playerName={player.full_name} />
            <UploadButton playerId={player.id} playerName={player.full_name} maxFiles={50} />
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
                      <span className="text-sm text-[#0F1F33]" style={{ textTransform: 'capitalize' }}>{clip.title}</span>
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
      {bullpenOpen && (
        <BullpenModal
          playerId={player.id}
          playerName={player.full_name}
          initialSessions={sessions}
          onClose={() => setBullpenOpen(false)}
        />
      )}
    </>
  )
}
