'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptInviteAndRoute, linkPlayerRow } from '@/app/actions/auth'
import { runAction } from '@/lib/action-result'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { completeErrorRedirect, readAuthLinkError } from '@/lib/auth-link-error'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function CompleteInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error' | 'link-failed'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [nextUrl, setNextUrl] = useState('/dashboard')

  // Signed in, but the player row wasn't linked: say so, offer a retry, and
  // let them continue anyway (the sign-in itself worked; the age-screen gate
  // in the middleware still applies on every page).
  async function retryLink() {
    setRetrying(true)
    const link = await runAction(() => linkPlayerRow())
    if (!link.ok) {
      setErrorMsg(link.error)
      setRetrying(false)
      return
    }
    const routed = await runAction(() => acceptInviteAndRoute(nextUrl))
    setRetrying(false)
    if (!routed.ok) {
      setErrorMsg(routed.error)
      return
    }
    if ('redirect' in routed.value) {
      window.location.href = safeRedirectPath(routed.value.redirect, '/dashboard', window.location.origin)
      return
    }
    if ('linkFailed' in routed.value) {
      setErrorMsg('You’re signed in, but we couldn’t connect your account to your player profile.')
      setNextUrl(safeRedirectPath(routed.value.next, '/dashboard', window.location.origin))
      return
    }
    setErrorMsg(routed.value.error)
    setStatus('error')
  }

  useEffect(() => {
    async function handleComplete() {
      const supabase = createClient()
      const next = safeRedirectPath(searchParams.get('next'), '/dashboard', window.location.origin)

      const hash = window.location.hash.slice(1)
      const hashParams = new URLSearchParams(hash)
      // Strip tokens and error details from the URL bar before we classify
      // or set a session — hash params stay in memory on hashParams.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)

      const dest = completeErrorRedirect(next, readAuthLinkError(searchParams, hashParams))
      if (dest) {
        await supabase.auth.signOut({ scope: 'local' })
        window.location.replace(`${window.location.origin}${safeRedirectPath(dest, '/auth/login', window.location.origin)}`)
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

        // Same invite-only gate and age routing as the auth routes: strays go
        // to the waitlist, newly linked players to onboarding (age screen).
        const routed = await runAction(() => acceptInviteAndRoute(next))
        if (!routed.ok) {
          setErrorMsg(routed.error)
          setStatus('error')
          return
        }
        if ('redirect' in routed.value) {
          window.location.href = safeRedirectPath(routed.value.redirect, '/dashboard', window.location.origin)
          return
        }
        if ('linkFailed' in routed.value) {
          setErrorMsg('You’re signed in, but we couldn’t connect your account to your player profile.')
          // Same-site paths only for the Continue link and retry.
          setNextUrl(safeRedirectPath(routed.value.next, '/dashboard', window.location.origin))
          setStatus('link-failed')
          return
        }
        setErrorMsg(routed.value.error)
        setStatus('error')
        return
      }

      const tokenHash = searchParams.get('token_hash')
      const type      = searchParams.get('type')
      const code      = searchParams.get('code')

      if (code) {
        window.location.href = `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeRedirectPath(next, '/dashboard', window.location.origin))}`
        return
      }
      if (tokenHash && type) {
        window.location.href = `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(safeRedirectPath(next, '/dashboard', window.location.origin))}`
        return
      }

      await supabase.auth.signOut({ scope: 'local' })
      window.location.href = '/auth/login'
    }

    handleComplete()
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
            <a href={safeRedirectPath(nextUrl)} className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors" style={oswald}>
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

export default function CompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-xs text-[#3D5166]" style={oswald}>Setting up your account…</p>
      </div>
    }>
      <CompleteInner />
    </Suspense>
  )
}
