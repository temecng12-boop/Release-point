'use client'

import { useRef, useState, useTransition } from 'react'
import { parseTrackmanPDF, type ParsedPitchRow } from '@/app/actions/import-pdf'

interface Props {
  onImport: (rows: ParsedPitchRow[]) => void
}

export default function TrackmanImport({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedPitchRow[] | null>(null)

  function handleFile(file: File) {
    setError(null)
    setPreview(null)
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const { pitches, error: err } = await parseTrackmanPDF(fd)
      if (err) { setError(err); return }
      setPreview(pitches)
    })
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-[#DDE4ED] rounded-xl p-6 text-center cursor-pointer hover:border-[#C8102E]/40 hover:bg-red-50/50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />
        <svg className="w-8 h-8 text-[#3D5166]/40 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        {isPending ? (
          <p className="text-sm text-[#3D5166]">Reading pitch data…</p>
        ) : (
          <>
            <p className="text-sm text-[#3D5166]">Drop your pitch data PDF here</p>
            <p className="text-xs text-[#3D5166]/60 mt-0.5">or click to browse · TrackMan, Rapsodo, Hawk-Eye</p>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[#DDE4ED]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#DDE4ED] bg-[#F5F7FA]">
                  {['Pitch', 'Avg Velo', 'Max Velo', 'Avg Spin', 'IVB', 'HB', 'Axis°'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[#3D5166] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-[#DDE4ED] last:border-0">
                    <td className="px-3 py-2 font-medium text-[#0F1F33]">{r.pitch_type}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.velocity ?? '—'}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.max_velocity ?? '—'}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.spin_rate?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.vertical_break != null ? `${r.vertical_break > 0 ? '+' : ''}${r.vertical_break}"` : '—'}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.horizontal_break != null ? `${r.horizontal_break > 0 ? '+' : ''}${r.horizontal_break}"` : '—'}</td>
                    <td className="px-3 py-2 text-[#3D5166] font-mono">{r.spin_axis ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-[#C8102E] text-white hover:bg-[#A50E26] transition-colors"
            onClick={() => { onImport(preview); setPreview(null) }}
          >
            Import {preview.length} pitch{preview.length !== 1 ? 'es' : ''} to this session
          </button>
        </div>
      )}
    </div>
  )
}
