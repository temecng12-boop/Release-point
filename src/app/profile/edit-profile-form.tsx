'use client'

import { useState } from 'react'
import { updateProfile } from '@/app/actions/player'

interface Props {
  initialName: string
  initialTeamName: string
}

export default function EditProfileForm({ initialName, initialTeamName }: Props) {
  const [name, setName] = useState(initialName)
  const [teamName, setTeamName] = useState(initialTeamName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const result = await updateProfile({ full_name: name, team_name: teamName })
    setSaving(false)
    if (result?.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  const inputClass =
    'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#7A92A8]'

  return (
    <div className="bg-white border border-[#DDE4ED] rounded-lg p-5 space-y-4 shadow-sm">
      <p
        className="text-xs text-[#7A92A8] tracking-widest"
        style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
      >
        Edit Profile
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[#456080] mb-1">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-[#456080] mb-1">Team Name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. Riverside Rockets"
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#C8102E]">{error}</p>}
      {saved && <p className="text-xs text-green-400">Profile updated.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}
