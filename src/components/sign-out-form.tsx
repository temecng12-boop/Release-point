'use client'

import type { ReactNode } from 'react'
import { signOut } from '@/app/actions/auth'
import { clearOfflineCaches } from '@/lib/sw-caches'

// Sign-out form that also clears the service worker caches, so nothing from
// the signed-in session stays on a shared device (QA-001 privacy follow-up).
export default function SignOutForm({ children }: { children: ReactNode }) {
  return (
    <form action={signOut} onSubmit={() => { clearOfflineCaches() }}>
      {children}
    </form>
  )
}
