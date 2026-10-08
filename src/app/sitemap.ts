import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://releasepointai.com',          lastModified: new Date(), changeFrequency: 'weekly',  priority: 1   },
    { url: 'https://releasepointai.com/about',     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://releasepointai.com/waitlist',  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
  ]
}
