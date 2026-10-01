'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { renameClip } from '@/app/actions/clips'
import { runAction } from '@/lib/action-result'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function ClipTitle({ clipId, initialTitle }: { clipId: string; initialTitle: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(initialTitle)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  // Last title the server accepted; a failed rename goes back to it.
  const [saved, setSaved]     = useState(initialTitle)
  const router = useRouter()

  async function save() {
    const trimmed = value.trim()
    if (!trimmed) { setValue(saved); setEditing(false); return }
    if (trimmed === saved) { setEditing(false); return }
    setSaving(true)
    setError(null)
    const result = await runAction(() => renameClip(clipId, trimmed))
    setSaving(false)
    setEditing(false)
    if (!result.ok) {
      setValue(saved)
      setError(`Rename failed: ${result.error}`)
      return
    }
    setSaved(trimmed)
    setValue(trimmed)
    router.refresh()
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          if (e.key === 'Escape') { setValue(saved); setEditing(false) }
        }}
        disabled={saving}
        className="text-base text-[#0F1F33] bg-transparent border-b border-[#456080] focus:outline-none w-full max-w-md disabled:opacity-50 max-sm:min-h-11"
        style={os}
      />
    )
  }

  return (
    <div>
      <button
        onClick={() => { setError(null); setEditing(true) }}
        className="group flex items-center gap-1.5 text-left hover:text-[#1C3A5C] transition-colors max-sm:min-h-11"
        title="Click to rename"
      >
        <span className="text-base text-[#0F1F33] group-hover:text-[#1C3A5C]" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'capitalize' }}>{value}</span>
        <svg className="w-3 h-3 text-[#8096AE] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-[#C8102E]">{error}</p>}
    </div>
  )
}
