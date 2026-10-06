import { MONTHS } from '@/lib/birth-months'

// Neutral age screen fields (spec T1): birth month and year, no default and no
// hint about age limits. The server turns them into a band and drops them.
const field = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-500 min-h-11'

export default function BirthFields({ legendClassName, legendStyle }: { legendClassName?: string; legendStyle?: React.CSSProperties }) {
  return (
    <fieldset>
      <legend className={legendClassName ?? 'block text-xs text-slate-600 mb-1.5'} style={legendStyle}>What&apos;s your birth month and year?</legend>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <label className="block">
          <span className="sr-only">Birth month</span>
          <select name="birth_month" required defaultValue="" className={field} aria-label="Birth month">
            <option value="" disabled>Month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Birth year</span>
          <input name="birth_year" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required
            autoComplete="off" placeholder="Year" aria-label="Birth year" className={field} />
        </label>
      </div>
    </fieldset>
  )
}
