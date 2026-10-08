'use client'

import { useState } from 'react'
import Link from 'next/link'
import UploadButton from './upload-button'
import RecordButton from './record-button'
import UploadBlockedNotice from '@/components/upload-blocked-notice'
import { canUploadVideo, pendingReason } from '@/lib/consent'
import EditPlayerModal from './edit-player-modal'
import BullpenModal from './bullpen-modal'
import type { BullpenSession } from './bullpen-modal'
import { deleteClip } from '@/app/actions/clips'
import { runAction } from '@/lib/action-result'
import PositionTags from '@/components/position-tags'

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
  positions?: string[] | null
  consent_given_at: string | null
  adult_confirmed_at: string | null
  age_band?: string | null
  age_confirmed_at?: string | null
  age_band_pending_migration?: boolean
  age_band_coach?: string | null
  age_band_self?: string | null
  teamIds: string[]
}

interface Props {
  player: Player
  clips: Clip[]
  teams: Team[]
  sessions: BullpenSession[]
  /** True if the viewer is this player's coach. Only the coach can add video. */
  isOwnPlayer?: boolean
}

function fmtDate(sessionDate: string | null | undefined, createdAt: string) {
  const iso = sessionDate ?? createdAt
  return new Date(iso + (sessionDate ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlayerRow({ player, clips, teams, sessions, isOwnPlayer = true }: Props) {
  const [editOpen, setEditOpen]         = useState(false)
  const [bullpenOpen, setBullpenOpen]   = useState(false)
  const [confirmClip, setConfirmClip]   = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<string | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const uploadAllowed = canUploadVideo(player)
  const reason = pendingReason(player)
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null)

  async function handleDeleteClip(clipId: string) {
    setDeletingClip(clipId)
    setDeleteError(null)
    setDeleteWarning(null)
    const result = await runAction(() => deleteClip(clipId))
    setDeletingClip(null)
    if (!result.ok) {
      setDeleteError(result.error)
    } else {
      setConfirmClip(null)
      // Deleted, but storage cleanup failed: say so instead of a clean success.
      setDeleteWarning(result.warning)
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
                className="text-sm font-medium text-[#0F1F33] hover:text-[#1C3A5C] hover:underline max-sm:inline-flex max-sm:items-center max-sm:min-h-11 max-sm:min-w-11"
              >
                {player.full_name}
              </Link>
              {player.age_group && (
                <span className="text-xs bg-[#EEF2F7] text-[#456080] px-2 py-0.5 rounded-full">
                  {player.age_group}
                </span>
              )}
              <PositionTags player={player} />
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
              className="text-[10px] sm:text-xs bg-[#EEF2F7] hover:bg-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors border border-[#DDE4ED] max-sm:min-h-11 max-sm:min-w-11"
            >
              Edit
            </button>
            <button
              onClick={() => setBullpenOpen(true)}
              title="Log a bullpen session: track pitch types, velo, spin, and coach notes"
              className="text-[10px] sm:text-xs bg-[#EEF2F7] hover:bg-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors border border-[#DDE4ED] whitespace-nowrap flex items-center gap-1 max-sm:min-h-11"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#1C3A5C] shrink-0" />
              Bullpen
              {sessions.length > 0 && (
                <span className="text-[9px] bg-[#1C3A5C] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">{sessions.length}</span>
              )}
            </button>
            {isOwnPlayer && (
              <>
                <RecordButton playerId={player.id} playerName={player.full_name} consent={player} />
                <UploadButton playerId={player.id} playerName={player.full_name} consent={player} showBlockedNotice={false} maxFiles={50} />
              </>
            )}
          </div>
        </div>

        {!isOwnPlayer && (
          <p className="px-4 py-2 border-b border-[#DDE4ED] text-xs text-[#3D5166]">Only this player&apos;s coach can add video.</p>
        )}

        {isOwnPlayer && !uploadAllowed && (
          <div className="px-4 py-2 border-b border-[#DDE4ED]">
            <UploadBlockedNotice viewer="coach" reason={reason ?? undefined} />
          </div>
        )}

        {deleteWarning && (
          <p role="status" className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#DDE4ED] text-xs text-[#8A5A00] bg-[#FFF8E6]">
            {deleteWarning}
            <button onClick={() => setDeleteWarning(null)} className="text-[#3D5166] hover:text-[#0F1F33] max-sm:min-h-11 max-sm:min-w-11" aria-label="Dismiss">✕</button>
          </p>
        )}

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
                        className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-2 py-0.5 rounded transition-colors disabled:opacity-50 max-sm:min-h-11"
                      >
                        {deletingClip === clip.id ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => { setConfirmClip(null); setDeleteError(null) }}
                        className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors max-sm:min-h-11 max-sm:min-w-11"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2 hover:bg-[#F0F4F8] transition-colors group">
                    <Link href={`/clips/${clip.id}`} className="flex-1 flex items-center justify-between max-sm:min-h-11">
                      <span className="text-sm text-[#0F1F33]" style={{ textTransform: 'capitalize' }}>{clip.title}</span>
                      <span className="text-xs text-[#456080]">{fmtDate(clip.session_date, clip.created_at)}</span>
                    </Link>
                    {/* Always visible on touch screens (no hover there); revealed on hover with a mouse. */}
                    <button
                      onClick={() => setConfirmClip(clip.id)}
                      className="ml-3 text-[#3D5166] hover:text-[#C8102E] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!min-w-11 inline-flex items-center justify-center transition-all text-xs leading-none shrink-0"
                      title="Delete clip"
                      aria-label={`Delete clip ${clip.title}`}
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
