// Public static and metadata routes that must work while signed out (QA-013):
// the PWA manifest and icons, service worker, robots/sitemap, social images
// and static files. Everything else keeps the login redirect.
//
// The middleware `matcher` (src/middleware.ts) must be a literal, so it
// repeats this rule; src/lib/__tests__/public-paths.test.ts keeps them in step.

const PUBLIC_FILES = new Set(['/favicon.ico', '/sw.js', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest'])
// icon / apple-icon (optionally icon1, icon-<id>, icon/<id>) at the root;
// opengraph-image / twitter-image at any level.
const ICON_ROUTE = /^\/(?:apple-icon|icon)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:\/[^/]*)?$/
const SOCIAL_IMAGE = /(?:^|\/)(?:opengraph-image|twitter-image)(?:[0-9]+|-[A-Za-z0-9_-]+)?(?:\/[^/]*)?$/
export const STATIC_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'html', 'txt', 'xml', 'webmanifest', 'woff', 'woff2', 'ttf', 'otf'] as const
const STATIC_FILE = new RegExp(`\\.(?:${STATIC_EXTENSIONS.join('|')})$`, 'i')

export function isPublicAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/static/') || pathname.startsWith('/_next/image')) return true
  if (PUBLIC_FILES.has(pathname)) return true
  if (ICON_ROUTE.test(pathname) || SOCIAL_IMAGE.test(pathname)) return true
  return STATIC_FILE.test(pathname)
}
