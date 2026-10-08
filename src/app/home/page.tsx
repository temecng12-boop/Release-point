import type { ResolvingMetadata } from 'next'
import { pageMetadata } from '@/lib/site-meta'
export { default } from '@/app/page'

// /home duplicates the root page: its own canonical + social URL.
export function generateMetadata(_props: unknown, parent: ResolvingMetadata) {
  return pageMetadata('/home', parent)
}
