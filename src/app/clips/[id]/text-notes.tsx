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
    <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[#3D5166] tracking-wider" style={oswald}>Coach Notes</p>
        {isCoach && (
          <span className="text-xs text-[#3D5166]">
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
          className="w-full text-sm bg-white border border-[#DDE4ED] rounded-md p-3 text-[#0F1F33] placeholder:text-[#3D5166] resize-none focus:outline-none focus:border-[#456080]"
        />
      ) : (
        notes
          ? <p className="text-sm text-[#0F1F33] whitespace-pre-wrap">{notes}</p>
          : <p className="text-sm text-[#3D5166]">No notes from coach yet.</p>
      )}
    </div>
  )
}
