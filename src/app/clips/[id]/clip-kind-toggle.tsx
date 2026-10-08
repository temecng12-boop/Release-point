'use client'

import { useState } from 'react'
import { saveClipKind } from '@/app/actions/clips'
import { runAction } from '@/lib/action-result'
import type { ClipKind } from '@/lib/positions'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const OPTIONS: { value: ClipKind; label: string }[] = [
  { value: 'pitching', label: 'Pitching' },
  { value: 'hitting', label: 'Hitting' },
]

export default function ClipKindToggle({
  clipId,
  value,
  canEdit,
  onSaved,
}: {
  clipId: string
  value: ClipKind
  /** Coach or player. Guardians see the current kind but cannot save. */
  canEdit: boolean
  onSaved?: (kind: ClipKind) => void
}) {
  const [kind, setKind] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(next: ClipKind) {
    if (next === kind || saving || !canEdit) return
    setSaving(true)
    setError(null)
    const result = await runAction(() => saveClipKind(clipId, next))
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setKind(next)
    onSaved?.(next)
  }

  return (
    <div data-testid="clip-kind-toggle" className="mb-3">
      <p className="text-[10px] tracking-widest text-[#8096AE] mb-1.5" style={os}>This clip</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const pressed = kind === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={pressed}
              disabled={saving || !canEdit}
              onClick={() => choose(opt.value)}
              className={`min-h-11 min-w-11 px-4 py-2 rounded-full border text-xs transition-colors disabled:opacity-60 ${
                pressed
                  ? 'bg-[#023167] border-[#023167] text-white'
                  : 'bg-white border-[#DDE4ED] text-[#456080] hover:border-[#456080]'
              }`}
              style={os}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-[#C8102E]">{error}</p>}
    </div>
  )
}
