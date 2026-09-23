'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SaveBanner({ role }: { role: 'coach' | 'player' }) {
  const router = useRouter()
  const [flash, setFlash] = useState(false)

  // Listen for notes-saved events dispatched by ClipNotes
  useEffect(() => {
    function onSaved() {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 2500)
      return () => clearTimeout(t)
    }
    window.addEventListener('clip-notes-saved', onSaved)
    return () => window.removeEventListener('clip-notes-saved', onSaved)
  }, [])

  if (role !== 'coach') return null

  return (
    <div className="sticky bottom-0 mt-6 bg-white border-t border-[#DDE4ED] px-5 py-3 flex items-center justify-between shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <span
        className={`text-xs transition-opacity duration-500 ${flash ? 'text-green-600 opacity-100' : 'text-[#3D5166] opacity-100'}`}
      >
        {flash ? '✓ All feedback saved' : 'Annotations, recordings & notes save automatically'}
      </span>

      <button
        onClick={() => router.push('/dashboard')}
        className="text-xs bg-[#C8102E] hover:bg-red-700 text-white px-4 py-1.5 rounded-lg transition-colors"
        style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        Done — Back to Dashboard
      </button>
    </div>
  )
}
