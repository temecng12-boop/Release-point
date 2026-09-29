'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createClip, getSignedUploadUrl } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const CONCURRENCY = 3

type FileEntry = {
  id: string
  file: File
  title: string
  status: 'queued' | 'uploading' | 'done' | 'error'
  errorMsg?: string
}

export default function BulkUploadModal({
  playerId,
  playerName,
  files,
  onClose,
}: {
  playerId: string
  playerName: string
  files: File[]
  onClose: () => void
}) {
  const router = useRouter()

  const [entries, setEntries] = useState<FileEntry[]>(() =>
    files.map((f, i) => ({
      id: `${i}-${f.name}`,
      file: f,
      title: f.name.replace(/\.[^.]+$/, ''),
      status: 'queued',
    }))
  )
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  function updateEntry(id: string, patch: Partial<FileEntry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  async function uploadOne(entry: FileEntry) {
    updateEntry(entry.id, { status: 'uploading' })
    const supabase = createClient()
    const ext = entry.file.name.split('.').pop() ?? 'mp4'
    const storagePath = `${playerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const urlResult = await getSignedUploadUrl(storagePath)
    if ('error' in urlResult) {
      updateEntry(entry.id, { status: 'error', errorMsg: urlResult.error ?? 'Upload failed' })
      return
    }

    const { error: uploadError } = await supabase.storage
      .from('clips')
      .uploadToSignedUrl(urlResult.path, urlResult.token, entry.file, { contentType: entry.file.type })

    if (uploadError) {
      updateEntry(entry.id, { status: 'error', errorMsg: uploadError.message })
      return
    }

    const result = await createClip({
      player_id: playerId,
      storage_path: storagePath,
      title: entry.title.trim() || entry.file.name,
      session_date: null,
    })

    if (result?.error) {
      updateEntry(entry.id, { status: 'error', errorMsg: result.error })
      return
    }

    updateEntry(entry.id, { status: 'done' })
  }

  async function startUpload() {
    setUploading(true)
    const snapshot = entries.slice()
    for (let i = 0; i < snapshot.length; i += CONCURRENCY) {
      await Promise.allSettled(snapshot.slice(i, i + CONCURRENCY).map(e => uploadOne(e)))
    }
    setDone(true)
    setUploading(false)
    router.refresh()
  }

  const successCount = entries.filter(e => e.status === 'done').length
  const errorCount = entries.filter(e => e.status === 'error').length
  const activeCount = entries.filter(e => e.status === 'queued' || e.status === 'uploading').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white border border-[#DDE4ED] shadow-lg rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="h-1 bg-[#C8102E] shrink-0" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#DDE4ED] shrink-0">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Bulk Upload</p>
          <p className="text-sm text-[#0F1F33] mt-0.5 font-medium">
            {files.length} clip{files.length !== 1 ? 's' : ''} — {playerName}
          </p>
          {!uploading && !done && (
            <p className="text-xs text-[#8096AE] mt-1">Edit clip names below, then tap Upload All.</p>
          )}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#DDE4ED]">
          {entries.map(entry => (
            <div key={entry.id} className="px-5 py-3 flex items-center gap-3">
              {/* Status indicator */}
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                {entry.status === 'done' && (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {entry.status === 'error' && (
                  <svg className="w-4 h-4 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {entry.status === 'uploading' && (
                  <div className="w-3.5 h-3.5 border-2 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
                )}
                {entry.status === 'queued' && (
                  <div className="w-2 h-2 rounded-full bg-[#DDE4ED]" />
                )}
              </div>

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                {uploading || done ? (
                  <p className="text-sm text-[#0F1F33] truncate">{entry.title}</p>
                ) : (
                  <input
                    value={entry.title}
                    onChange={e => updateEntry(entry.id, { title: e.target.value })}
                    className="w-full text-sm text-[#0F1F33] border-0 border-b border-[#DDE4ED] focus:border-[#456080] focus:outline-none bg-transparent pb-0.5"
                  />
                )}
                <p className={`text-[11px] mt-0.5 truncate ${entry.errorMsg ? 'text-[#C8102E]' : 'text-[#8096AE]'}`}>
                  {entry.errorMsg ?? `${(entry.file.size / 1024 / 1024).toFixed(1)} MB`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#DDE4ED] shrink-0 flex items-center justify-between gap-3">
          {done ? (
            <>
              <p className="text-sm text-[#0F1F33]">
                {successCount} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ' successfully'}
              </p>
              <button
                onClick={onClose}
                className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-5 py-2 rounded-md transition-colors"
                style={oswald}
              >
                Done
              </button>
            </>
          ) : uploading ? (
            <>
              <p className="text-sm text-[#3D5166]">{activeCount} remaining…</p>
              <div className="w-5 h-5 border-2 border-[#C8102E] border-t-transparent rounded-full animate-spin shrink-0" />
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="text-xs text-[#456080] hover:text-[#0F1F33] px-3 py-1.5 rounded-md border border-[#DDE4ED] transition-colors"
                style={oswald}
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-5 py-2 rounded-md transition-colors"
                style={oswald}
              >
                Upload {entries.length} Clip{entries.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
