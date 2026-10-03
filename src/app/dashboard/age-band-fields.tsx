'use client'

import { useState } from 'react'
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from '@/lib/consent'

// The add-player forms' age choice (name="age_band") and, for under 13, the
// optional parent or guardian fields (guardian_name / guardian_email).
// Same inputs and labels as the forms they sit in.
export default function AgeBandFields({ labelClass, inputClass, labelStyle }: {
  labelClass: string
  inputClass: string
  labelStyle?: React.CSSProperties
}) {
  const [band, setBand] = useState<AgeBand | null>(null)
  return (
    <>
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
      </fieldset>
      {band === 'under_13' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="invite-guardian-name" className={labelClass} style={labelStyle}>Parent / Guardian Name (optional)</label>
            <input id="invite-guardian-name" type="text" name="guardian_name" placeholder="Parent or guardian" className={inputClass} />
          </div>
          <div>
            <label htmlFor="invite-guardian-email" className={labelClass} style={labelStyle}>Parent / Guardian Email (optional)</label>
            <input id="invite-guardian-email" type="email" name="guardian_email" placeholder="parent@example.com" className={inputClass} />
          </div>
          <p className="sm:col-span-2 text-[10px] text-[#3D5166] leading-relaxed">
            Players under 13 need consent from a parent or guardian before video can be added. We&apos;ll email them a consent link. You can also add it later in Edit Player.
          </p>
        </div>
      )}
    </>
  )
}
