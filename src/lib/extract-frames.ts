'use client'

export async function extractVideoFrames(count = 5): Promise<string[]> {
  const video = document.querySelector('video') as HTMLVideoElement | null
  if (!video || !video.duration || !isFinite(video.duration)) return []

  const wasPaused = video.paused
  video.pause()

  const maxWidth = 640
  const scale = Math.min(1, maxWidth / (video.videoWidth || 640))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round((video.videoWidth  || 640) * scale)
  canvas.height = Math.round((video.videoHeight || 360) * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const duration = video.duration
  // Spread frames across 15%–85% of the clip — captures balance through follow-through
  const positions = Array.from({ length: count }, (_, i) =>
    duration * (0.15 + (i * 0.70) / Math.max(count - 1, 1))
  )

  const frames: string[] = []
  const savedTime = video.currentTime

  for (const t of positions) {
    await new Promise<void>(resolve => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = t
    })
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
      frames.push(dataUrl.replace(/^data:image\/jpeg;base64,/, ''))
    } catch {
      // Canvas tainted by CORS — skip this frame
    }
  }

  video.currentTime = savedTime
  if (!wasPaused) video.play().catch(() => {})

  return frames
}
