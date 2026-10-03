'use client'

import { useState } from 'react'
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from '@/lib/age-band'
import { UNDER_13_INVITE_REFUSED } from '@/lib/under13-mode'

// The add-player forms' age choice (name="age_band"), required, no default.
// Under 13 can't be added yet (hard stop): the note says so before sending,
// and invitePlayer refuses it on the server.
export default function AgeBandFields({ labelClass, labelStyle }: {
  labelClass: string
  labelStyle?: React.CSSProperties
}) {
  const [band, setBand] = useState<AgeBand | null>(null)
  return (
    <fieldset>
      <legend className={labelClass} style={labelStyle}>Player Age</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {AGE_BANDS.map((b) => (
          <label key={b} className="flex items-center gap-1.5 cursor-pointer max-sm:min-h-11">
            <input type="radio" name="age_band" value={b} required onChange={() => setBand(b)} className="accent-[#C8102E]" />
            <span className="text-xs text-[#456080]">{AGE_BAND_LABELS[b]}</span>
          </label>
        ))}
      </div>
      {band === 'under_13' && (
        <p role="status" className="mt-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">{UNDER_13_INVITE_REFUSED}</p>
      )}
    </fieldset>
  )
}
