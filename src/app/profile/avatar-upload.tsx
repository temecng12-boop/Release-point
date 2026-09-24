'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { uploadAvatar } from '@/app/actions/player'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const CROP_SIZE = 280

interface Props {
  userId: string
  currentAvatarUrl: string | null
  displayName: string
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function CropModal({ file, onCancel, onConfirm }: {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const touchRef = useRef<{ x: number; y: number; dist?: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const s = CROP_SIZE / Math.min(img.width, img.height)
      setScale(s)
      setOffset({ x: 0, y: 0 })
      setLoaded(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !loaded) return
    const ctx = canvas.getContext('2d')!
    const W = CROP_SIZE

    ctx.clearRect(0, 0, W, W)

    const iw = img.width * scale
    const ih = img.height * scale
    const x = W / 2 - iw / 2 + offset.x
    const y = W / 2 - ih / 2 + offset.y
    ctx.drawImage(img, x, y, iw, ih)

    // Dimmed overlay with circular cutout
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, W)
    ctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(0,0,0,0.52)'
    ctx.fill('evenodd')
    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }, [loaded, offset, scale])

  useEffect(() => { draw() }, [draw])

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
  }
  function onMouseUp() { dragging.current = false }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setScale(s => Math.max(0.2, Math.min(6, s - e.deltaY * 0.0015)))
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchRef.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) }
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (!touchRef.current) return
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchRef.current.x
      const dy = e.touches[0].clientY - touchRef.current.y
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
    } else if (e.touches.length === 2 && touchRef.current.dist !== undefined) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / touchRef.current.dist
      touchRef.current.dist = dist
      setScale(s => Math.max(0.2, Math.min(6, s * ratio)))
    }
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img) return
    const out = document.createElement('canvas')
    out.width = CROP_SIZE
    out.height = CROP_SIZE
    const ctx = out.getContext('2d')!
    const W = CROP_SIZE
    ctx.beginPath()
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2)
    ctx.clip()
    const iw = img.width * scale
    const ih = img.height * scale
    const x = W / 2 - iw / 2 + offset.x
    const y = W / 2 - ih / 2 + offset.y
    ctx.drawImage(img, x, y, iw, ih)
    out.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-[#E8102A]" />
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-950 tracking-[0.2em]" style={oswald}>Crop Photo</p>
            <p className="text-xs text-slate-400 mt-1">Drag to reposition · scroll or pinch to zoom</p>
          </div>

          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={CROP_SIZE}
              height={CROP_SIZE}
              className="rounded-full cursor-grab active:cursor-grabbing select-none bg-slate-100"
              style={{ width: CROP_SIZE, height: CROP_SIZE, touchAction: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={() => { touchRef.current = null }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 transition-all border border-slate-200 hover:bg-slate-50"
              style={oswald}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-lg text-xs bg-[#E8102A] hover:bg-[#C80E24] text-white transition-all"
              style={oswald}
            >
              Save Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AvatarUpload({ userId: _userId, currentAvatarUrl, displayName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  function handleRawFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 20 * 1024 * 1024) { setError('Image must be under 20 MB'); return }
    setError(null)
    setPendingFile(file)
  }

  async function handleCropped(blob: Blob) {
    setPendingFile(null)
    setUploading(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    const result = await uploadAvatar(fd)
    if (result?.error) {
      setError(result.error)
    } else if (result?.avatarUrl) {
      setAvatarUrl(result.avatarUrl + `?t=${Date.now()}`)
    }
    setUploading(false)
  }

  return (
    <>
      {pendingFile && (
        <CropModal
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropped}
        />
      )}

      <div className="relative group cursor-pointer shrink-0" onClick={() => !uploading && inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleRawFile(f); e.target.value = '' }}
        />

        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-[#1C3A5C] to-[#456080] flex items-center justify-center relative">
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

        {error && <p className="text-xs text-[#E8102A] mt-1 max-w-[80px] text-center leading-tight">{error}</p>}
      </div>
    </>
  )
}
