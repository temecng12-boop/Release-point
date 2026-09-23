'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createClip, getSignedUploadUrl } from '@/app/actions/clips'

const COMPRESS_THRESHOLD_MB = 30
const FFMPEG_CORE_VERSION = '0.12.6'
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

async function compressVideo(file: File, onProgress: (pct: number) => void): Promise<File> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  ffmpeg.on('progress', ({ progress }) => onProgress(Math.round(progress * 100)))

  const base = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  const ext = file.name.split('.').pop() ?? 'mp4'
  await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file))

  await ffmpeg.exec([
    '-i', `input.${ext}`,
    '-vf', 'scale=-2:720',
    '-c:v', 'libx264',
    '-crf', '28',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  const data = await ffmpeg.readFile('output.mp4')
  const rawBytes = typeof data === 'string' ? new TextEncoder().encode(data) : (data as Uint8Array)
  const safeBuf = rawBytes.buffer instanceof SharedArrayBuffer
    ? rawBytes.slice(0).buffer
    : (rawBytes.buffer as ArrayBuffer)
  const blob = new Blob([safeBuf], { type: 'video/mp4' })
  return new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' })
}

type Phase = 'idle' | 'compressing' | 'uploading'

export default function UploadButton({
  playerId,
  playerName,
  consentGiven = true,
}: {
  playerId: string
  playerName: string
  consentGiven?: boolean
}) {
  const [phase, setPhase]             = useState<Phase>('idle')
  const [compressPct, setCompressPct] = useState(0)
  const [error, setError]             = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  async function handleFile(file: File) {
    setError(null)
    let fileToUpload = file

    const largeEnough = file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024
    const canCompress = typeof SharedArrayBuffer !== 'undefined'

    if (largeEnough && canCompress) {
      setPhase('compressing')
      setCompressPct(0)
      try {
        fileToUpload = await compressVideo(file, setCompressPct)
      } catch {
        // Compression failed — upload original. User will see the larger file size.
        fileToUpload = file
        setError('Compression failed — uploading original file.')
      }
    }

    setPhase('uploading')

    const ext = fileToUpload.name.split('.').pop() ?? 'mp4'
    const storagePath = `${playerId}/${Date.now()}.${ext}`

    const urlResult = await getSignedUploadUrl(storagePath)
    if ('error' in urlResult) {
      setError(urlResult.error ?? 'Upload failed')
      setPhase('idle')
      return
    }

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('clips')
      .uploadToSignedUrl(urlResult.path, urlResult.token, fileToUpload, { contentType: fileToUpload.type })

    if (uploadError) {
      setError(uploadError.message)
      setPhase('idle')
      return
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const title = `${playerName} — ${today}`

    const result = await createClip({
      player_id:    playerId,
      storage_path: storagePath,
      title,
      session_date: null,
    })

    if (result?.error) {
      setError(result.error)
      setPhase('idle')
      return
    }

    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  // ── consent gate ──────────────────────────────────────────────────────────
  if (!consentGiven) {
    return (
      <div className="relative group">
        <button
          disabled
          className="text-xs bg-[#EEF2F7] text-[#3D5166] px-3 py-1.5 rounded-md cursor-not-allowed whitespace-nowrap border border-[#DDE4ED]"
        >
          Upload Clip
        </button>
        <div className="absolute bottom-full mb-2 right-0 w-52 bg-white border border-[#DDE4ED] shadow-sm rounded px-3 py-2 text-xs text-[#456080] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          Guardian consent required before uploading clips for this player.
        </div>
      </div>
    )
  }

  // ── compressing overlay ───────────────────────────────────────────────────
  if (phase === 'compressing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-xl p-7 w-80 space-y-5">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Optimizing Video</p>
          <p className="text-sm text-[#0F1F33]">Compressing to 720p for faster playback…</p>
          <div>
            <div className="h-1.5 bg-[#DDE4ED] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C8102E] rounded-full transition-all duration-300"
                style={{ width: `${compressPct}%` }}
              />
            </div>
            <p className="text-xs text-[#3D5166] mt-2 text-right">{compressPct}%</p>
          </div>
        </div>
      </div>
    )
  }

  // ── idle / uploading trigger ──────────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {error && <p className="text-xs text-[#C8102E]">{error}</p>}
      <button
        onClick={() => phase === 'idle' && inputRef.current?.click()}
        disabled={phase === 'uploading'}
        className="text-[10px] sm:text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
      >
        {phase === 'uploading' ? 'Uploading…' : 'Upload Clip'}
      </button>
    </div>
  )
}
