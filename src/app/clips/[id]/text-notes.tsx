'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving'>('saved')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef(notes)
  notesRef.current = notes

  async function persistNotes(text: string) {
    setSaveStatus('saving')
    await createClient().from('clips').update({ notes: text }).eq('id', clipId)
    setSaveStatus('saved')
    window.dispatchEvent(new CustomEvent('clip-notes-saved'))
  }

  function onNotesChange(text: string) {
    setNotes(text)
    setSaveStatus('pending')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persistNotes(text), 1800)
  }

  function onNotesBlur() {
    if (saveStatus === 'pending') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      persistNotes(notesRef.current)
    }
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#4A6880] tracking-widest" style={oswald}>Coach Notes</p>
        {isCoach && (
          <span className="text-xs text-[#4A6880]">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'pending' ? 'Unsaved' : 'Saved ✓'}
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
          className="w-full text-sm bg-[#060F1A] border border-[#1C3A5C] rounded-md p-3 text-[#E8EDF5] placeholder:text-[#4A6880] resize-none focus:outline-none focus:border-[#9FB3CC]"
        />
      ) : (
        notes
          ? <p className="text-sm text-[#E8EDF5] whitespace-pre-wrap">{notes}</p>
          : <p className="text-sm text-[#4A6880]">No notes from coach yet.</p>
      )}
    </div>
  )
}
