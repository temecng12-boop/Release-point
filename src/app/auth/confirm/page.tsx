'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { linkPlayerRow } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function ConfirmInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleConfirm() {
      const supabase = createClient()
      const next = searchParams.get('next') ?? '/dashboard'

      const hash = window.location.hash.slice(1)
      const hashParams = new URLSearchParams(hash)
      const accessToken  = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        await supabase.auth.signOut()

        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) {
          setErrorMsg(error.message)
          setStatus('error')
          return
        }

        await linkPlayerRow()
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

      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    }

    handleConfirm()
  }, [searchParams])

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
