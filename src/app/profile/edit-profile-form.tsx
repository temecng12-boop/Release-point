'use client'

import { useState } from 'react'
import { updateProfile } from '@/app/actions/player'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-lg px-4 py-3 text-sm text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] transition-colors'
const labelClass = 'block text-xs text-[#456080] mb-1.5 tracking-wide'

const PLAYING_LEVELS = [
  'MLB',
  'AAA (Triple-A)',
  'AA (Double-A)',
  'A/A+ (Single-A)',
  'Independent League',
  'College – D1',
  'College – D2',
  'College – D3',
  'JUCO',
  'High School',
  'Did not play professionally',
]

interface Props {
  initialName: string
  initialTeamName: string
  initialBio?: string
  initialCollege?: string
  initialPlayingCareer?: string
  initialCoachingSince?: number | null
  initialCertifications?: string[]
  initialLocation?: string
  initialTwitter?: string
  initialInstagram?: string
  initialLinkedin?: string
}

export default function EditProfileForm({
  initialName,
  initialTeamName,
  initialBio = '',
  initialCollege = '',
  initialPlayingCareer = '',
  initialCoachingSince = null,
  initialCertifications = [],
  initialLocation = '',
  initialTwitter = '',
  initialInstagram = '',
  initialLinkedin = '',
}: Props) {
  const [name, setName] = useState(initialName)
  const [teamName, setTeamName] = useState(initialTeamName)
  const [bio, setBio] = useState(initialBio)
  const [college, setCollege] = useState(initialCollege)
  const [playingCareer, setPlayingCareer] = useState(initialPlayingCareer)
  const [coachingSince, setCoachingSince] = useState(initialCoachingSince?.toString() ?? '')
  const [certInput, setCertInput] = useState('')
  const [certifications, setCertifications] = useState<string[]>(initialCertifications)
  const [location, setLocation] = useState(initialLocation)
  const [twitter, setTwitter] = useState(initialTwitter)
  const [instagram, setInstagram] = useState(initialInstagram)
  const [linkedin, setLinkedin] = useState(initialLinkedin)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function addCert() {
    const val = certInput.trim()
    if (val && !certifications.includes(val)) {
      setCertifications([...certifications, val])
    }
    setCertInput('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const result = await updateProfile({
      full_name: name,
      team_name: teamName,
      bio: bio || undefined,
      college: college || undefined,
      playing_career: playingCareer || undefined,
      coaching_since: coachingSince ? parseInt(coachingSince) : null,
      certifications,
      location: location || undefined,
      social_twitter: twitter || undefined,
      social_instagram: instagram || undefined,
      social_linkedin: linkedin || undefined,
    })

    setSaving(false)
    if (result?.error) setError(result.error)
    else setSaved(true)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Basic Info */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#C8102E]" />
        <div className="p-6 space-y-5">
          <p className="text-xs text-[#C8102E] tracking-[0.3em]" style={oswald}>Basic Info</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={oswald}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={oswald}>Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Orlando, FL" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} style={oswald}>Organization / Team Name</label>
            <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. Riverside Elite Baseball" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} style={oswald}>Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell players and parents about your coaching philosophy and experience…"
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>
      </div>

      {/* Baseball Background */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 space-y-5">
          <p className="text-xs text-[#C8102E] tracking-[0.3em]" style={oswald}>Baseball Background</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={oswald}>College / University</label>
              <input type="text" value={college} onChange={e => setCollege(e.target.value)} placeholder="e.g. University of Florida" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={oswald}>Coaching Since</label>
              <input
                type="number"
                value={coachingSince}
                onChange={e => setCoachingSince(e.target.value)}
                placeholder="2010"
                min="1960"
                max="2030"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} style={oswald}>Highest Playing Level</label>
            <select value={playingCareer} onChange={e => setPlayingCareer(e.target.value)} className={inputClass}>
              <option value="">Select level…</option>
              {PLAYING_LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Certifications */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 space-y-4">
          <p className="text-xs text-[#C8102E] tracking-[0.3em]" style={oswald}>Certifications & Credentials</p>
          {certifications.length > 0 && (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-[#F8FAFC] rounded-lg border border-[#DDE4ED]">
              {certifications.map(c => (
                <span key={c} className="flex items-center gap-1.5 text-xs bg-[#1C3A5C] text-white px-2.5 py-1 rounded-full shrink-0">
                  {c}
                  <button
                    type="button"
                    onClick={() => setCertifications(certifications.filter(x => x !== c))}
                    className="opacity-60 hover:opacity-100 leading-none min-h-0"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={certInput}
              onChange={e => setCertInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCert() } }}
              placeholder="e.g. NSCA-CSCS, Driveline Certified, NASM…"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={addCert}
              className="px-4 py-2 text-sm bg-[#1C3A5C] text-white rounded-lg hover:bg-[#0F1F33] transition-colors shrink-0"
              style={oswald}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Social / Contact */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 space-y-4">
          <p className="text-xs text-[#C8102E] tracking-[0.3em]" style={oswald}>Social & Contact</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass} style={oswald}>Twitter / X</label>
              <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="@handle" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={oswald}>Instagram</label>
              <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@handle" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={oswald}>LinkedIn</label>
              <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="linkedin.com/in/…" className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[#C8102E]">{error}</p>}
      {saved && <p className="text-sm text-green-600">Profile saved.</p>}

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
