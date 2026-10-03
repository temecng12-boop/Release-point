'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resendGuardianInvite, saveGuardianForPlayer } from '@/app/actions/guardian'
import { runAction } from '@/lib/action-result'

// Add guardian / Resend for an under-13 player without consent (coach only;
// the server checks players.coach_id = caller). Same button look as
// MarkAdultButton; the form uses Edit Player's modal markup. Success text
// comes from the server and only after the email went out.
const btn = 'text-xs bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 px-3 py-1 rounded-md transition-colors disabled:opacity-50 max-sm:min-h-11'
const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#3D5166] max-sm:min-h-11'

export default function GuardianActions({
  playerId,
  playerName,
  guardianEmail,
  guardianName,
}: {
  playerId: string
  playerName: string
  /** The guardian's email (shown to the player's own coach), if on file. */
  guardianEmail?: string | null
  guardianName?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  async function resend() {
    setBusy(true)
    setMessage(null)
    const r = await runAction(() => resendGuardianInvite(playerId))
    setBusy(false)
    if (!r.ok) { setMessage({ ok: false, text: r.error }); return }
    setMessage({ ok: true, text: 'success' in r.value ? r.value.success : 'Consent email sent.' })
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className={btn} onClick={() => { setOpen(true); setMessage(null) }} disabled={busy}>
          {guardianEmail ? 'Change guardian' : 'Add guardian'}
        </button>
        {guardianEmail && (
          <button type="button" className={btn} onClick={resend} disabled={busy}>
            {busy ? 'Sending…' : 'Resend'}
          </button>
        )}
      </div>
      {guardianEmail && <p className="text-xs text-amber-800">Guardian on file: {guardianEmail}</p>}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-xs ${message.ok ? 'text-green-700' : 'text-[#C8102E]'}`}>{message.text}</p>
      )}
      {open && (
        <GuardianModal
          playerId={playerId}
          playerName={playerName}
          initialEmail={guardianEmail ?? ''}
          initialName={guardianName ?? ''}
          onClose={() => setOpen(false)}
          onSaved={(text) => { setOpen(false); setMessage({ ok: true, text }); router.refresh() }}
        />
      )}
    </div>
  )
}

export function GuardianModal({
  playerId, playerName, initialEmail, initialName, onClose, onSaved,
}: {
  playerId: string; playerName: string; initialEmail: string; initialName: string
  onClose: () => void; onSaved: (message: string) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const r = await runAction(() => saveGuardianForPlayer(playerId, { email, full_name: name }))
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    onSaved('success' in r.value ? r.value.success : 'Guardian saved.')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-lg p-6 w-full max-w-md mx-4 space-y-4" role="dialog" aria-label="Parent or guardian">
        <h2 className="text-base tracking-widest text-[#0F1F33]" style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}>
          Parent or Guardian
        </h2>
        <p className="text-xs text-[#456080]">
          {playerName} is under 13. We&apos;ll email this parent or guardian a link to give consent before video can be added.
        </p>
        <div className="space-y-3">
          <div>
            <label htmlFor={`guardian-name-${playerId}`} className="block text-xs text-[#456080] mb-1">Guardian Name</label>
            <input id={`guardian-name-${playerId}`} type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Parent or guardian name" />
          </div>
          <div>
            <label htmlFor={`guardian-email-${playerId}`} className="block text-xs text-[#456080] mb-1">Guardian Email</label>
            <input id={`guardian-email-${playerId}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="parent@example.com" />
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-[#C8102E]">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={save} disabled={saving || !email.trim()}
            className="flex-1 bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 max-sm:min-h-11">
            {saving ? 'Saving…' : 'Save and Email'}
          </button>
          <button onClick={onClose} disabled={saving}
            className="flex-1 border border-[#DDE4ED] text-[#456080] hover:text-[#0F1F33] hover:border-[#456080] rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50 max-sm:min-h-11">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
