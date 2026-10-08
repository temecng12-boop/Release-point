import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Release Point AI',
    short_name: 'Release Point AI',
    description: 'Pitching and hitting mechanics analysis for coaches and players.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F1F33',
    theme_color: '#0F1F33',
    categories: ['sports', 'education', 'productivity'],
    icons: [
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    screenshots: [],
  }
}
