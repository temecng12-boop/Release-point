'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePlayer, deletePlayer } from '@/app/actions/player'

interface Props {
  player: {
    id: string
    full_name: string
    age_group: string | null
    position: string | null
  }
  onClose: () => void
}

const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']
const POSITIONS = ['pitcher', 'hitter']

export default function EditPlayerModal({ player, onClose }: Props) {
  const [fullName, setFullName]       = useState(player.full_name)
  const [ageGroup, setAgeGroup]       = useState(player.age_group ?? '')
  const [position, setPosition]       = useState(player.position ?? '')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const router = useRouter()

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updatePlayer(player.id, {
      full_name: fullName,
      age_group: ageGroup || undefined,
      position:  position || undefined,
    })
    setSaving(false)
    if (result?.error) setError(result.error)
    else onClose()
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const result = await deletePlayer(player.id)
    setDeleting(false)
    if (result?.error) {
      setError(result.error)
    } else {
      onClose()
      router.refresh()
    }
  }

  const inputClass =
    'w-full bg-[#060F1A] border border-[#1C3A5C] text-[#E8EDF5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#9FB3CC] placeholder:text-[#4A6880]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
        <h2
          className="text-base tracking-widest text-[#E8EDF5]"
          style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
        >
          Edit Player
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#9FB3CC] mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-[#9FB3CC] mb-1">Age Group</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className={inputClass}
            >
              <option value="">— select —</option>
              {AGE_GROUPS.map((ag) => (
                <option key={ag} value={ag}>{ag}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9FB3CC] mb-1">Position</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className={inputClass}
            >
              <option value="">— select —</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos.charAt(0).toUpperCase() + pos.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-[#C8102E]">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="flex-1 border border-[#1C3A5C] text-[#9FB3CC] hover:text-white hover:border-[#9FB3CC] rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* Delete section */}
        <div className="border-t border-[#1C3A5C] pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={saving || deleting}
              className="text-xs text-[#4A6880] hover:text-[#C8102E] transition-colors"
            >
              Remove from roster
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-[#9FB3CC]">Remove {player.full_name}?</p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[#9FB3CC] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
