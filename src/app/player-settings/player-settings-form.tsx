'use client'

import { useState, useMemo, useEffect } from 'react'
import { updatePlayerSelfProfile } from '@/app/actions/player'
import { COLLEGE_PROGRAMS } from '@/data/college-programs'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-lg px-4 py-3 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] transition-colors'
const labelClass = 'block text-xs text-[#456080] mb-1.5 tracking-wide'

interface Player {
  id: string | null
  full_name: string | null
  height: string | null
  weight: string | null
  high_school: string | null
  travel_team: string | null
  graduation_year: number | null
  throws: string | null
  bats: string | null
  college_interests: string[] | null
  college_offers: string[] | null
  age_group: string | null
  position: string | null
}

function CollegePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return COLLEGE_PROGRAMS.filter(p => p.toLowerCase().includes(q)).slice(0, 12)
  }, [search])

  function toggle(program: string) {
    if (value.includes(program)) onChange(value.filter(p => p !== program))
    else onChange([...value, program])
  }

  return (
    <div>
      <label className={labelClass} style={oswald}>{label}</label>

      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 max-h-36 overflow-y-auto p-2 bg-[#F8FAFC] rounded-lg border border-[#DDE4ED]">
          {value.map(p => (
            <span key={p} className="flex items-center gap-1.5 text-xs bg-[#1C3A5C] text-white px-2.5 py-1 rounded-full shrink-0">
              {p}
              <button type="button" onClick={() => toggle(p)} className="opacity-60 hover:opacity-100 leading-none min-h-0">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search programs…"
          className={inputClass}
        />
        {filtered.length > 0 && (
          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-[#DDE4ED] rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => { toggle(p); setSearch('') }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4F8] transition-colors min-h-0 ${value.includes(p) ? 'text-[#C8102E] font-medium' : 'text-[#0F1F33]'}`}
              >
                {value.includes(p) ? '✓ ' : ''}{p}
              </button>
            ))}
          </div>
        )}
      </div>
      {value.length === 0 && <p className="text-xs text-[#3D5166] mt-1.5">Type to search any college or university baseball program.</p>}
    </div>
  )
}

export default function PlayerSettingsForm({ player }: { player: Player | null }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  const [height, setHeight] = useState(player?.height ?? '')
  const [weight, setWeight] = useState(player?.weight ?? '')
  const [highSchool, setHighSchool] = useState(player?.high_school ?? '')
  const [travelTeam, setTravelTeam] = useState(player?.travel_team ?? '')
  const [gradYear, setGradYear] = useState(player?.graduation_year?.toString() ?? '')
  const [throws, setThrows] = useState(player?.throws ?? '')
  const [bats, setBats] = useState(player?.bats ?? '')
  const [interests, setInterests] = useState<string[]>(player?.college_interests ?? [])
  const [offers, setOffers] = useState<string[]>(player?.college_offers ?? [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const result = await updatePlayerSelfProfile({
      height: height || undefined,
      weight: weight || undefined,
      high_school: highSchool || undefined,
      travel_team: travelTeam || undefined,
      graduation_year: gradYear ? (Number.isFinite(parseInt(gradYear, 10)) ? parseInt(gradYear, 10) : null) : null,
      throws: throws || undefined,
      bats: bats || undefined,
      college_interests: interests,
      college_offers: offers,
    })

    setSaving(false)
    if (result?.error) setError(result.error)
    else setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Physical stats */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#C8102E]" />
        <div className="p-6 space-y-5">
          <p className="text-[13px] text-[#C8102E] tracking-[0.2em]" style={oswald}>Physical Info</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={oswald}>Height</label>
              <input type="text" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 6'2&quot;" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={oswald}>Weight</label>
              <input type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 185 lbs" className={inputClass} />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass} style={oswald}>Throws</label>
              <select value={throws} onChange={e => setThrows(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                <option>Right</option>
                <option>Left</option>
                <option>Switch</option>
              </select>
            </div>
            <div>
              <label className={labelClass} style={oswald}>Bats</label>
              <select value={bats} onChange={e => setBats(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                <option>Right</option>
                <option>Left</option>
                <option>Switch</option>
              </select>
            </div>
            <div>
              <label className={labelClass} style={oswald}>Graduation Year</label>
              <input type="number" value={gradYear} onChange={e => setGradYear(e.target.value)} placeholder="2026" min="2020" max="2035" className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      {/* School info */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 space-y-5">
          <p className="text-[13px] text-[#C8102E] tracking-[0.2em]" style={oswald}>School & Team</p>
          <div>
            <label className={labelClass} style={oswald}>High School</label>
            <input type="text" value={highSchool} onChange={e => setHighSchool(e.target.value)} placeholder="e.g. Lake Mary High School" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} style={oswald}>Travel Ball Team</label>
            <input type="text" value={travelTeam} onChange={e => setTravelTeam(e.target.value)} placeholder="e.g. Perfect Game Elite 17U" className={inputClass} />
          </div>
        </div>
      </div>

      {/* College interests — no overflow-hidden so the search dropdown isn't clipped */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm">
        <div className="h-1 bg-[#C8102E] rounded-t-xl" />
        <div className="p-6 space-y-6">
          <p className="text-[13px] text-[#C8102E] tracking-[0.2em]" style={oswald}>College Recruiting</p>
          <CollegePicker label="Schools I'm Interested In" value={interests} onChange={setInterests} />
          <CollegePicker label="Offers Received" value={offers} onChange={setOffers} />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <span className="text-[#C8102E] text-sm">✕</span>
          <p className="text-sm text-[#C8102E]">{error}</p>
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <span className="text-green-600 text-sm">✓</span>
          <p className="text-sm text-green-700">Profile saved.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3.5 text-sm font-medium transition-colors disabled:opacity-50"
        style={oswald}
      >
        {saving ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  )
}
