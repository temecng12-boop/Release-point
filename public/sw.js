// Release Point Service Worker
// Enables PWA installation (Chrome requires a SW for the install prompt).
//
// Only static assets are cached (cache-first, versioned cache name). Pages,
// RSC payloads, server actions, /api and /auth always go to the network and
// are never stored, so a reload after a save always shows fresh data and no
// logged-in page survives sign out (QA-001, QA-002).

const CACHE_VERSION = 'v2'
const STATIC_CACHE = `rp-static-${CACHE_VERSION}`

const STATIC_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot)$/i
const STATIC_PATHS = new Set(['/manifest.webmanifest', '/icon', '/apple-icon', '/favicon.ico'])

/**
 * Pure routing decision for a request. Returns 'cache-first' for static
 * assets, 'network' for everything else (the SW leaves the request alone).
 * `req` is { method, url, mode, headers } where headers is a plain object
 * with lower-case keys; `origin` is the SW's own origin.
 */
function routeRequest(req, origin) {
  if ((req.method || 'GET').toUpperCase() !== 'GET') return 'network'
  let url
  try { url = new URL(req.url) } catch { return 'network' }
  if (url.origin !== origin) return 'network'

  const h = req.headers || {}
  if (req.mode === 'navigate') return 'network'
  if ((h['accept'] || '').includes('text/html')) return 'network'
  if (h['rsc'] || h['next-action'] || h['next-router-state-tree'] || h['next-router-prefetch']) return 'network'
  if (url.searchParams.has('_rsc')) return 'network'

  const p = url.pathname
  if (p === '/api' || p.startsWith('/api/') || p === '/auth' || p.startsWith('/auth/')) return 'network'
  if (p.startsWith('/_next/image')) return 'network' // may proxy private images
  if (p.startsWith('/_next/static/')) return 'cache-first'
  if (STATIC_PATHS.has(p)) return 'cache-first'
  if (STATIC_EXTENSIONS.test(p)) return 'cache-first'
  return 'network'
}

/** Pure check: may this response be stored in the static cache? */
function shouldStoreResponse(res) {
  if (!res || !res.ok || res.status !== 200) return false
  if (res.type && res.type !== 'basic') return false
  if (res.redirected) return false
  const cc = (res.cacheControl || '').toLowerCase()
  if (/\b(no-store|private)\b/.test(cc)) return false
  return true
}

function plainHeaders(headers) {
  const out = {}
  headers.forEach((v, k) => { out[k.toLowerCase()] = v })
  return out
}

function clearAllCaches() {
  return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', () => {
    self.skipWaiting()
  })

  self.addEventListener('activate', (e) => {
    e.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    )
  })

  self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'CLEAR_CACHES') {
      e.waitUntil(clearAllCaches())
    }
  })

  self.addEventListener('fetch', (e) => {
    const req = e.request
    const decision = routeRequest(
      { method: req.method, url: req.url, mode: req.mode, headers: plainHeaders(req.headers) },
      self.location.origin
    )
    if (decision !== 'cache-first') return // straight to the network, never cached

    e.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached
          return fetch(req).then((res) => {
            const meta = {
              ok: res.ok, status: res.status, type: res.type, redirected: res.redirected,
              cacheControl: res.headers.get('cache-control'),
            }
            if (shouldStoreResponse(meta)) cache.put(req, res.clone())
            return res
          })
        })
      )
    )
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { routeRequest, shouldStoreResponse, STATIC_CACHE }
}
