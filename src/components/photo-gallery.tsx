'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback } from 'react'

const PHOTOS = [
  { src: '/media/nolan-delivery.jpg', alt: 'Full extension — mid-delivery at the stadium' },
  { src: '/media/nolan-windup.jpg',   alt: 'Wind-up — high leg lift, reading the target' },
  { src: '/media/nolan-finish.jpg',   alt: 'Finish — complete follow-through on the mound' },
]

export default function PhotoGallery() {
  const [open, setOpen] = useState<number | null>(null)

  const close = useCallback(() => setOpen(null), [])
  const prev  = useCallback(() => setOpen(i => (i != null ? (i - 1 + PHOTOS.length) % PHOTOS.length : null)), [])
  const next  = useCallback(() => setOpen(i => (i != null ? (i + 1) % PHOTOS.length : null)), [])

  useEffect(() => {
    if (open == null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     close()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close, prev, next])

  return (
    <>
      {/* 3-photo layout: large left, two stacked right */}
      <div className="grid grid-cols-2 gap-3 h-full">
        {/* Large primary photo */}
        <button
          className="row-span-2 relative rounded-2xl overflow-hidden aspect-[3/4] group cursor-zoom-in focus:outline-none"
          onClick={() => setOpen(0)}
        >
          <Image
            src={PHOTOS[0].src}
            alt={PHOTOS[0].alt}
            fill
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </button>

        {/* Two stacked smaller photos */}
        {PHOTOS.slice(1).map((p, idx) => (
          <button
            key={p.src}
            className="relative rounded-2xl overflow-hidden aspect-[4/3] group cursor-zoom-in focus:outline-none"
            onClick={() => setOpen(idx + 1)}
          >
            <Image
              src={p.src}
              alt={p.alt}
              fill
              className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {open != null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={close}
        >
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl p-2" onClick={close}>✕</button>
          <button className="absolute left-4 text-white/60 hover:text-white text-3xl p-4" onClick={e => { e.stopPropagation(); prev() }}>‹</button>

          <div className="relative w-full max-w-4xl max-h-[90vh] aspect-[3/2] mx-16" onClick={e => e.stopPropagation()}>
            <Image src={PHOTOS[open].src} alt={PHOTOS[open].alt} fill className="object-contain" sizes="90vw" priority />
          </div>

          <button className="absolute right-4 text-white/60 hover:text-white text-3xl p-4" onClick={e => { e.stopPropagation(); next() }}>›</button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs">{open + 1} / {PHOTOS.length}</p>
        </div>
      )}
    </>
  )
}
