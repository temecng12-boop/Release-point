'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePlayer, deletePlayer, setPlayerAdultConfirmed, setPlayerAgeBand } from '@/app/actions/player'
import { runAction } from '@/lib/action-result'
import { AGE_BANDS, AGE_BAND_LABELS, isAgeBand, type AgeBand } from '@/lib/age-band'
import { PARENT_CONSENT_COMING_SOON } from '@/lib/under13-mode'

interface Team { id: string; name: string }
interface Props {
  player: {
    id: string
    full_name: string
    age_group: string | null
    position: string | null
    adult_confirmed_at?: string | null
    consent_given_at?: string | null
    age_band?: string | null
    age_band_coach?: string | null
    age_band_self?: string | null
    age_band_pending_migration?: boolean
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
  // The coach's own answer (037); before 037, 023's 18+ confirmation.
  const initialBand: AgeBand | '' = player.age_band_pending_migration
    ? (player.adult_confirmed_at ? '18_plus' : '')
    : isAgeBand(player.age_band_coach) ? player.age_band_coach : ''
  const selfBand = isAgeBand(player.age_band_self) ? player.age_band_self : null
  const [band, setBand]           = useState<AgeBand | ''>(initialBand)
  const [notice, setNotice]       = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removedWarning, setRemovedWarning] = useState<string | null>(null)
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
    if (result?.error) { setSaving(false); setError(result.error); return }
    if (band && band !== initialBand) {
      // Before migration 037 only 18+ can be stored (023's column).
      const ageResult = await runAction(() => player.age_band_pending_migration
        ? setPlayerAdultConfirmed(player.id, band === '18_plus')
        : setPlayerAgeBand(player.id, band))
      if (!ageResult.ok) { setSaving(false); setError(ageResult.error); router.refresh(); return }
      const saved = ageResult.value as { band?: string | null; youngerKept?: boolean }
      if (saved.youngerKept && isAgeBand(saved.band)) {
        // The player's own (younger) answer wins: say so instead of closing.
        setSaving(false)
        router.refresh()
        setNotice(`Saved. ${fullName || 'The player'}'s own answer is younger, so their age stays ${AGE_BAND_LABELS[saved.band].toLowerCase()}.`)
        return
      }
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const result = await deletePlayer(player.id)
    setDeleting(false)
    if (result?.error) setError(result.error)
    else if ('warning' in result && result.warning) { setRemovedWarning(result.warning); router.refresh() }
    else { onClose(); router.refresh() }
  }

  if (removedWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 py-6">
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
          <p role="alert" className="text-sm text-[#C8102E]">{removedWarning}</p>
          <button onClick={onClose} className="bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium">OK</button>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#3D5166]'

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <fieldset>
            <legend className="block text-xs text-[#456080] mb-1">Player Age</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {AGE_BANDS.map((b) => (
                <label key={b} className="flex items-center gap-1.5 cursor-pointer max-sm:min-h-11">
                  <input type="radio" name={`age_band_${player.id}`} value={b} checked={band === b} onChange={() => setBand(b)} className="accent-[#C8102E]" />
                  <span className="text-xs text-[#456080]">{AGE_BAND_LABELS[b]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[#3D5166] mt-1">
              {band === 'under_13'
                ? `Video can't be added for players under 13. ${PARENT_CONSENT_COMING_SOON}`
                : 'Video can be added once the age is confirmed (13 or older).'}
            </p>
            {selfBand && (
              <p className="text-xs text-[#3D5166] mt-1" data-testid="self-band-note">
                The player answered {AGE_BAND_LABELS[selfBand].toLowerCase()}. If your answers differ, the younger one is used.
              </p>
            )}
          </fieldset>

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

        {error && <p role="alert" className="text-xs text-[#C8102E]">{error}</p>}
        {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={handleSave} disabled={saving || deleting}
            className="flex-1 bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 max-sm:min-h-11">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} disabled={saving || deleting}
            className="flex-1 border border-[#DDE4ED] text-[#456080] hover:text-white hover:border-[#456080] rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50 max-sm:min-h-11">
            {notice ? 'Close' : 'Cancel'}
          </button>
        </div>

        <div className="border-t border-[#DDE4ED] pt-3">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} disabled={saving || deleting}
              className="text-xs text-[#3D5166] hover:text-[#C8102E] transition-colors">
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
