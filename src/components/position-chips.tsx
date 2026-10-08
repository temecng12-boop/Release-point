'use client'

import { useState } from 'react'
import {
  PLAYER_POSITIONS,
  POSITION_LABELS,
  parsePositionsInput,
  resolvePlayerPositions,
  type PlayerPosition,
  type PositionSource,
} from '@/lib/positions'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export function positionsFromSource(row: PositionSource | null | undefined): PlayerPosition[] {
  return resolvePlayerPositions(row)
}

export default function PositionChips({
  value,
  defaultValue,
  onChange,
  name,
  legend = 'Position',
  hint = 'Optional. Tap any that apply.',
  id = 'position-chips',
}: {
  value?: PlayerPosition[]
  defaultValue?: PlayerPosition[]
  onChange?: (next: PlayerPosition[]) => void
  /** When set, each selected tag is posted as a hidden input (invite forms). */
  name?: string
  legend?: string
  hint?: string
  id?: string
}) {
  const initial = value ?? defaultValue ?? []
  const [internal, setInternal] = useState<PlayerPosition[]>(initial)
  const selected = value ?? internal

  function toggle(tag: PlayerPosition) {
    const next = selected.includes(tag) ? selected.filter((p) => p !== tag) : [...selected, tag]
    if (value === undefined) setInternal(next)
    onChange?.(next)
  }

  return (
    <fieldset data-testid={id}>
      <legend className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={os}>
        {legend} <span className="text-[#3D5166] normal-case tracking-normal">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {PLAYER_POSITIONS.map((tag) => {
          const pressed = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(tag)}
              className={`min-h-11 min-w-11 px-3 py-2 rounded-full border text-xs transition-colors ${
                pressed
                  ? 'bg-[#C8102E] border-[#C8102E] text-white'
                  : 'bg-white border-[#DDE4ED] text-[#456080] hover:border-[#456080]'
              }`}
              style={os}
            >
              {POSITION_LABELS[tag]}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-[10px] text-[#3D5166] mt-1.5 leading-relaxed">{hint}</p>}
      {name && selected.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
    </fieldset>
  )
}

/** Read the current chip selection from a form (invite / team invite). */
export function positionsFromFormData(formData: FormData, key = 'positions'): PlayerPosition[] {
  const parsed = parsePositionsInput(formData.getAll(key))
  return parsed.ok ? parsed.positions : []
}
