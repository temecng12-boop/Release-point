import { notFound } from 'next/navigation'
import { devPagesEnabled } from '@/lib/dev-pages'

export default function DevLayout({ children }: LayoutProps<'/dev'>) {
  if (!devPagesEnabled()) notFound()
  return children
}
