'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const COMPRESS_THRESHOLD_MB = 30
const FFMPEG_CORE_VERSION = '0.12.6'
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function today() {
  return new Date().toISOString().slice(0, 10)
}

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
  const blob = new Blob([data as Uint8Array], { type: 'video/mp4' })
  return new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' })
}

type Phase = 'idle' | 'date' | 'compressing' | 'uploading'

export default function UploadButton({
  playerId,
  playerName,
  consentGiven = true,
}: {
  playerId: string
  playerName: string
  consentGiven?: boolean
}) {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [sessionDate, setSessionDate] = useState(today())
  const [compressPct, setCompressPct] = useState(0)
  const [error, setError]           = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  function onFileSelected(file: File) {
    setPendingFile(file)
    setSessionDate(today())
    setError(null)
    setPhase('date')
  }

  async function handleUpload() {
    if (!pendingFile) return
    setError(null)

    let fileToUpload = pendingFile
    const largEnough = pendingFile.size > COMPRESS_THRESHOLD_MB * 1024 * 1024
    const canCompress = typeof SharedArrayBuffer !== 'undefined'

    if (largEnough && canCompress) {
      setPhase('compressing')
      setCompressPct(0)
      try {
        fileToUpload = await compressVideo(pendingFile, setCompressPct)
      } catch {
        // compression failed — upload original
        fileToUpload = pendingFile
      }
    }

    setPhase('uploading')
    const supabase = createClient()
    const ext = fileToUpload.name.split('.').pop() ?? 'mp4'
    const storagePath = `${playerId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('clips')
      .upload(storagePath, fileToUpload, { contentType: fileToUpload.type })

    if (uploadError) {
      setError(uploadError.message)
      setPhase('date')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const formattedDate = sessionDate
      ? new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const title = formattedDate ? `${playerName} — ${formattedDate}` : `${playerName} Video`

    let { error: dbError } = await supabase.from('clips').insert({
      player_id:    playerId,
      uploaded_by:  user!.id,
      storage_path: storagePath,
      title,
      session_date: sessionDate || null,
    })

    if (dbError?.message?.includes('session_date')) {
      const retry = await supabase.from('clips').insert({
        player_id:    playerId,
        uploaded_by:  user!.id,
        storage_path: storagePath,
        title:        `${playerName} Video`,
      })
      dbError = retry.error
    }

    if (dbError) {
      setError(dbError.message)
      setPhase('date')
      return
    }

    setPendingFile(null)
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  function cancel() {
    setPendingFile(null)
    setPhase('idle')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── consent gate ──────────────────────────────────────────────────────────
  if (!consentGiven) {
    return (
      <div className="relative group">
        <button
          disabled
          className="text-xs bg-[#1C3A5C] text-[#4A6880] px-3 py-1.5 rounded-md cursor-not-allowed whitespace-nowrap"
        >
          Upload Clip
        </button>
        <div className="absolute bottom-full mb-2 right-0 w-52 bg-[#0B1E36] border border-[#1C3A5C] rounded px-3 py-2 text-xs text-[#9FB3CC] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          Guardian consent required before uploading clips for this player.
        </div>
      </div>
    )
  }

  // ── compressing modal ─────────────────────────────────────────────────────
  if (phase === 'compressing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl p-7 w-80 space-y-5">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Optimizing Video</p>
          <p className="text-sm text-[#E8EDF5]">Compressing to 720p for faster playback…</p>
          <div>
            <div className="h-1.5 bg-[#1C3A5C] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C8102E] rounded-full transition-all duration-300"
                style={{ width: `${compressPct}%` }}
              />
            </div>
            <p className="text-xs text-[#4A6880] mt-2 text-right">{compressPct}%</p>
          </div>
        </div>
      </div>
    )
  }

  // ── date picker + upload modal ────────────────────────────────────────────
  if (phase === 'date' || phase === 'uploading') {
    const isUploading = phase === 'uploading'
    const sizeLabel = pendingFile
      ? `${(pendingFile.size / 1024 / 1024).toFixed(0)} MB`
      : ''
    const willCompress =
      pendingFile &&
      pendingFile.size > COMPRESS_THRESHOLD_MB * 1024 * 1024 &&
      typeof SharedArrayBuffer !== 'undefined'

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl p-6 w-80 space-y-4 shadow-xl">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Upload Clip</p>
          <p className="text-sm text-[#E8EDF5] truncate">{pendingFile?.name}</p>
          {willCompress && (
            <p className="text-xs text-[#4A6880]">
              {sizeLabel} — will be compressed to 720p before uploading
            </p>
          )}

          <div>
            <label className="block text-xs text-[#9FB3CC] mb-1.5">Session date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              disabled={isUploading}
              className="w-full bg-[#060F1A] border border-[#1C3A5C] text-[#E8EDF5] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#9FB3CC] disabled:opacity-50"
            />
          </div>

          {error && <p className="text-xs text-[#C8102E]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUpload}
              disabled={isUploading || !sessionDate}
              className="flex-1 text-xs bg-[#C8102E] hover:bg-red-700 text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
              style={oswald}
            >
              {isUploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              onClick={cancel}
              disabled={isUploading}
              className="text-xs text-[#9FB3CC] hover:text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
              style={oswald}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── idle trigger ──────────────────────────────────────────────────────────
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
      >
        Upload Clip
      </button>
    </div>
  )
}
