'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import SignOutForm from './sign-out-form'
import ReportProblemButton from './report-problem'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface Props {
  items: NavItem[]
  userName?: string | null
  userRole?: string | null
}

function HamburgerIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
      <rect y="0"  width="20" height="2" rx="1" fill="currentColor" />
      <rect y="6"  width="14" height="2" rx="1" fill="currentColor" />
      <rect y="12" width="20" height="2" rx="1" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function MobileNav({ items, userName, userRole }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const initials = (userName ?? 'U')
    .split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)

  // Portal target: renders outside <header> so globals.css `header a:not(.hidden)`
  // doesn't make drawer links inline-flex.
  const drawerPortal = mounted && createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)' }}
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              zIndex: 70, width: '78vw', maxWidth: '300px',
              background: '#fff', display: 'flex', flexDirection: 'column',
              boxShadow: '-2px 0 32px rgba(0,0,0,0.14)',
            }}
          >
            {/* Red accent strip */}
            <div style={{ height: 4, background: '#E8102A', flexShrink: 0 }} />

            {/* User identity */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #E8102A, #A50D1E)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
                  textTransform: 'uppercase', fontWeight: 700,
                }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {userName ?? 'User'}
                  </p>
                  <span style={{
                    ...os, fontSize: 10, padding: '2px 6px', borderRadius: 4, marginTop: 2, display: 'inline-block',
                    background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
                  }}>
                    {userRole ?? 'coach'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 36, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Nav links */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', textDecoration: 'none', color: '#334155' }}
                >
                  <span style={{ color: '#94a3b8', flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                  <span style={{ ...os, fontSize: 12, letterSpacing: '0.12em' }}>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <SignOutForm>
                <button
                  type="submit"
                  style={{ ...os, fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Sign Out
                </button>
              </SignOutForm>
              <ReportProblemButton />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )

  return (
    <>
      {/* Hamburger — mobile only. `hidden` opts it out of the globals.css
          `header button:not(.hidden)` rule; max-sm:flex re-enables on mobile. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="hidden max-sm:flex items-center justify-center min-h-11 min-w-11 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <HamburgerIcon />
      </button>

      {drawerPortal}
    </>
  )
}
