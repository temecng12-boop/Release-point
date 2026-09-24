// Release Point Service Worker
// Enables PWA installation (Chrome requires a SW for the install prompt).
// Caches the app shell for fast repeat loads.

const CACHE = 'rp-v1'
const PRECACHE = ['/', '/dashboard', '/auth/login']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Only handle same-origin GET requests; skip API, Supabase, and auth routes
  const url = new URL(e.request.url)
  if (
    e.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return res
      })
      // Stale-while-revalidate: serve cache instantly, update in background
      return cached ?? network
    })
  )
})
