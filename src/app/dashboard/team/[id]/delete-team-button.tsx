'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTeam } from '@/app/actions/team'
import { runAction } from '@/lib/action-result'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
// Inline, because globals.css sets an unlayered `button { min-height: 36px }`
// that wins over Tailwind's min-h-* utilities.
const tap = { minHeight: 44 }

// Delete the team after a confirm step that names it. The screen only leaves
// the team page once the server confirmed the delete; otherwise the dialog
// stays open with the error and the team is unchanged.
export default function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const result = await runAction(() => deleteTeam(teamId))
    if (!result.ok) {
      setError(result.error)
      setDeleting(false)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  function close() {
    if (deleting) return
    setOpen(false)
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 rounded-md border border-[#C8102E]/40 text-[#C8102E] text-xs active:bg-red-50 transition-colors"
        style={{ ...oswald, ...tap }}
      >
        Delete team
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-team-title"
            className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="delete-team-title" className="text-base text-[#0F1F33] mb-2 break-words" style={oswald}>
              Delete &ldquo;{teamName}&rdquo;?
            </p>
            <p className="text-sm text-[#456080] leading-relaxed mb-4">
              The team, its roster list and its coaching staff list are removed. Players are not deleted: their clips and data stay on their profiles.
            </p>
            {error && (
              <p role="alert" className="text-sm text-[#C8102E] mb-4">{error}</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="px-4 rounded-md border border-[#DDE4ED] text-sm text-[#0F1F33] disabled:opacity-50"
                style={tap}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 rounded-md bg-[#C8102E] text-white text-sm disabled:opacity-60"
                style={tap}
              >
                {deleting ? 'Deleting…' : 'Delete team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
