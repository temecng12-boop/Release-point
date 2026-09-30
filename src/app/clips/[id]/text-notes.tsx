'use client'

import { useEffect, useRef, useState } from 'react'
import { saveClipNotes } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function TextNotes({
  clipId,
  role,
  initialNotes,
}: {
  clipId: string
  role: 'coach' | 'player'
  initialNotes: string | null
}) {
  const isCoach = role === 'coach'
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef(notes)
  // Notes as last loaded or saved; sent with each save so the server can
  // refuse a stale overwrite (QA-002). Saves run one at a time.
  const baselineRef = useRef<string | null>(initialNotes ?? null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  function persistNotes(text: string) {
    saveChainRef.current = saveChainRef.current.then(() => persistNotesNow(text))
    return saveChainRef.current
  }

  async function persistNotesNow(text: string) {
    setSaveStatus('saving')
    let error: string | null = null
    try {
      const result = await saveClipNotes(clipId, text, baselineRef.current)
      if (result?.error) error = result.error
      else if (result && 'notes' in result) baselineRef.current = result.notes ?? null
    } catch (err) {
      console.error('[TextNotes] save request failed', err)
      error = 'Could not save notes. Check your connection and try again.'
    }
    if (error) {
      setSaveError(error)
      setSaveStatus('error')
      return
    }
    setSaveError(null)
    setSaveStatus('saved')
    window.dispatchEvent(new CustomEvent('clip-notes-saved'))
  }

  function onNotesChange(text: string) {
    notesRef.current = text
    setNotes(text)
    setSaveStatus('pending')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persistNotes(text), 1800)
  }

  function onNotesBlur() {
    if (saveStatus === 'pending' || saveStatus === 'error') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      persistNotes(notesRef.current)
    }
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[#3D5166] tracking-wider" style={oswald}>Coach Notes</p>
        {isCoach && (
          <span className="text-xs text-[#3D5166]">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'pending' ? 'Unsaved' : saveStatus === 'error' ? 'Save failed' : 'Saved ✓'}
          </span>
        )}
      </div>

      {isCoach ? (
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
          placeholder="Type coaching notes here…"
          rows={5}
          className="w-full text-sm bg-white border border-[#DDE4ED] rounded-md p-3 text-[#0F1F33] placeholder:text-[#3D5166] resize-none focus:outline-none focus:border-[#456080]"
        />
      ) : (
        notes
          ? <p className="text-sm text-[#0F1F33] whitespace-pre-wrap">{notes}</p>
          : <p className="text-sm text-[#3D5166]">No notes from coach yet.</p>
      )}

      {isCoach && saveStatus === 'error' && saveError && (
        <p role="alert" className="mt-2 text-xs text-[#C8102E]">{saveError}</p>
      )}
    </div>
  )
}
