import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/clips/', '/profile/', '/player-settings', '/guardian', '/onboarding', '/api/'],
      },
    ],
    sitemap: 'https://releasepointai.com/sitemap.xml',
  }
}
