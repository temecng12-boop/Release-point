import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-meta'

// Marketing + legal pages only. /home duplicates / and is canonicalized to
// it, so it stays out. App, auth, and API routes are disallowed in robots.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ['/', '/about', '/waitlist', '/privacy', '/terms'].map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: now,
  }))
}
