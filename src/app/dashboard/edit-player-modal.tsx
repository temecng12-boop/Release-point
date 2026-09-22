'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePlayer, deletePlayer } from '@/app/actions/player'

interface Team { id: string; name: string }
interface Props {
  player: {
    id: string
    full_name: string
    age_group: string | null
    position: string | null
    teamIds: string[]
  }
  teams: Team[]
  onClose: () => void
}

const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']
const POSITIONS = ['pitcher', 'hitter']

function heightOptions() {
  const opts: string[] = []
  for (let ft = 4; ft <= 7; ft++) {
    const maxIn = ft === 7 ? 0 : 11
    for (let inch = 0; inch <= maxIn; inch++) {
      opts.push(`${ft}'${inch}"`)
    }
  }
  return opts
}

function weightOptions() {
  const opts: string[] = []
  for (let w = 75; w <= 300; w += 5) opts.push(`${w} lbs`)
  return opts
}

const HEIGHTS = heightOptions()
const WEIGHTS = weightOptions()

export default function EditPlayerModal({ player, teams, onClose }: Props) {
  const [fullName, setFullName]   = useState(player.full_name)
  const [ageGroup, setAgeGroup]   = useState(player.age_group ?? '')
  const [position, setPosition]   = useState(player.position ?? '')
  const [height, setHeight]       = useState('')
  const [weight, setWeight]       = useState('')
  const [selectedTeams, setSelectedTeams] = useState<string[]>(player.teamIds)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const router = useRouter()

  function toggleTeam(id: string) {
    setSelectedTeams((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updatePlayer(player.id, {
      full_name: fullName,
      age_group: ageGroup || undefined,
      position:  position || undefined,
      teamIds:   selectedTeams,
    })
    setSaving(false)
    if (result?.error) setError(result.error)
    else { onClose(); router.refresh() }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const result = await deletePlayer(player.id)
    setDeleting(false)
    if (result?.error) setError(result.error)
    else { onClose(); router.refresh() }
  }

  const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#7A92A8]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
        <h2
          className="text-base tracking-widest text-[#0F1F33]"
          style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
        >
          Edit Player
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#456080] mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#456080] mb-1">Age Group</label>
              <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className={inputClass}>
                <option value="">— select —</option>
                {AGE_GROUPS.map((ag) => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#456080] mb-1">Position</label>
              <select value={position} onChange={(e) => setPosition(e.target.value)} className={inputClass}>
                <option value="">— select —</option>
                {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos.charAt(0).toUpperCase() + pos.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#456080] mb-1">Height</label>
              <select value={height} onChange={(e) => setHeight(e.target.value)} className={inputClass}>
                <option value="">— select —</option>
                {HEIGHTS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#456080] mb-1">Weight</label>
              <select value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass}>
                <option value="">— select —</option>
                {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {teams.length > 0 && (
            <div>
              <label className="block text-xs text-[#456080] mb-2">Teams</label>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTeam(t.id)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      selectedTeams.includes(t.id)
                        ? 'bg-[#C8102E] border-[#C8102E] text-white'
                        : 'border-[#DDE4ED] text-[#456080] hover:border-[#456080]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-[#C8102E]">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={handleSave} disabled={saving || deleting}
            className="flex-1 bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} disabled={saving || deleting}
            className="flex-1 border border-[#DDE4ED] text-[#456080] hover:text-white hover:border-[#456080] rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50">
            Cancel
          </button>
        </div>

        <div className="border-t border-[#DDE4ED] pt-3">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} disabled={saving || deleting}
              className="text-xs text-[#7A92A8] hover:text-[#C8102E] transition-colors">
              Remove from roster
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-[#456080]">Remove {player.full_name}?</p>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50">
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#456080] hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
