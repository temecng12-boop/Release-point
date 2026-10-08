'use client'

import { useState } from 'react'
import { approveWaitlistAsCoach } from '@/app/actions/admin'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function ApproveButton({
  id, email, name,
}: {
  id: string
  email: string
  name: string | null
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handle() {
    setState('loading')
    const result = await approveWaitlistAsCoach(id, email, name)
    if (result?.error) {
      setErrMsg(result.error)
      setState('error')
    } else {
      setState('done')
    }
  }

  if (state === 'done') {
    return (
      <span className="text-[10px] px-3 py-1.5 rounded-md" style={{ ...os, background: '#ECFDF5', color: '#16a34a' }}>
        Invite Sent ✓
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handle}
        disabled={state === 'loading'}
        className="text-[10px] px-3 py-1.5 rounded-md text-white transition-colors disabled:opacity-50"
        style={{ ...os, background: '#C8102E' }}
      >
        {state === 'loading' ? 'Sending…' : 'Approve as Coach'}
      </button>
      {state === 'error' && <p className="text-[10px] text-[#C8102E]">{errMsg}</p>}
    </div>
  )
}
