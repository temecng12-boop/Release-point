import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { devPagesEnabled } from '@/lib/dev-pages'

export default function DevLayout({ children }: { children: ReactNode }) {
  if (!devPagesEnabled()) notFound()
  return children
}
