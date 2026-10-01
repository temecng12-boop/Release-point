'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { linkPlayerRow } from '@/app/actions/auth'
import { runAction } from '@/lib/action-result'
import { RESET_PATH } from '@/lib/password-reset'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function ConfirmInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error' | 'link-failed'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [nextUrl, setNextUrl] = useState('/dashboard')

  // Signed in, but the player row wasn't linked: say so, offer a retry, and
  // let them continue anyway (the sign-in itself worked).
  async function retryLink() {
    setRetrying(true)
    const result = await runAction(() => linkPlayerRow())
    setRetrying(false)
    if (result.ok) { window.location.href = nextUrl; return }
    setErrorMsg(result.error)
  }

  useEffect(() => {
    async function handleConfirm() {
      const supabase = createClient()
      const next = searchParams.get('next') ?? '/dashboard'

      const hash = window.location.hash.slice(1)
      const hashParams = new URLSearchParams(hash)

      // Supabase sends an expired or used reset link back with ?error= (or #error=).
      if (next === RESET_PATH && (searchParams.get('error') || hashParams.get('error'))) {
        window.location.replace(`${window.location.origin}${RESET_PATH}?error=link`)
        return
      }
      const accessToken  = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        // Local only: drop this browser's old session, not the account's other devices (QA-012).
        await supabase.auth.signOut({ scope: 'local' })

        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) {
          setErrorMsg(error.message)
          setStatus('error')
          return
        }

        const link = await runAction(() => linkPlayerRow())
        if (!link.ok) {
          setErrorMsg(link.error)
          // Same-site paths only for the Continue link and retry.
          setNextUrl(/^\/(?![/\\])/.test(next) ? next : '/dashboard')
          setStatus('link-failed')
          return
        }
        window.location.href = next
        return
      }

      const tokenHash = searchParams.get('token_hash')
      const type      = searchParams.get('type')
      const code      = searchParams.get('code')

      if (code) {
        window.location.href = `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
        return
      }
      if (tokenHash && type) {
        window.location.href = `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`
        return
      }

      await supabase.auth.signOut({ scope: 'local' })
      window.location.href = '/auth/login'
    }

    handleConfirm()
  }, [searchParams])

  if (status === 'link-failed') {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-5">
        <div className="bg-white border border-[#DDE4ED] rounded-xl p-8 max-w-sm w-full text-center shadow-sm">
          <p className="text-sm text-[#C8102E] mb-4" style={oswald}>Account Not Connected</p>
          <p role="alert" className="text-xs text-[#3D5166] mb-6">{errorMsg}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={retryLink}
              disabled={retrying}
              className="w-full bg-[#C8102E] hover:bg-[#A50D26] text-white rounded-lg py-2.5 text-xs transition-colors disabled:opacity-50"
              style={oswald}
            >
              {retrying ? 'Trying again…' : 'Try Again'}
            </button>
            <a href={nextUrl} className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors" style={oswald}>
              Continue Anyway →
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-5">
        <div className="bg-white border border-[#DDE4ED] rounded-xl p-8 max-w-sm w-full text-center shadow-sm">
          <p className="text-sm text-[#C8102E] mb-4" style={oswald}>Link Invalid</p>
          <p className="text-xs text-[#3D5166] mb-6">{errorMsg || 'This invite link has expired or already been used.'}</p>
          <a href="/auth/login" className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors" style={oswald}>
            Go to Login →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
      <p className="text-xs text-[#3D5166]" style={oswald}>Setting up your account…</p>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-xs text-[#3D5166]" style={oswald}>Setting up your account…</p>
      </div>
    }>
      <ConfirmInner />
    </Suspense>
  )
}
