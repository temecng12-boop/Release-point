'use client'

import { useRef, useState } from 'react'
import { uploadAvatar } from '@/app/actions/player'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Props {
  userId: string
  currentAvatarUrl: string | null
  displayName: string
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function AvatarUpload({ userId: _userId, currentAvatarUrl, displayName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return }

    setUploading(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)

    const result = await uploadAvatar(fd)

    if (result?.error) {
      setError(result.error)
    } else if (result?.avatarUrl) {
      setAvatarUrl(result.avatarUrl + `?t=${Date.now()}`)
    }
    setUploading(false)
  }

  return (
    <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-[#1C3A5C] to-[#456080] flex items-center justify-center shrink-0 relative">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl text-white" style={oswald}>{initials(displayName)}</span>
        )}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-[#C8102E] mt-1 max-w-[80px] text-center">{error}</p>}
    </div>
  )
}
