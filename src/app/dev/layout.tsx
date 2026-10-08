import { notFound } from 'next/navigation'
import { devPagesEnabled } from '@/lib/dev-pages'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!devPagesEnabled()) notFound()
  return children
}
