// Clears every Cache Storage entry for this origin and asks the active
// service worker to do the same. Fire-and-forget; never throws.
export function clearOfflineCaches(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' })
  } catch { /* no service worker */ }
  try {
    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {})
    }
  } catch { /* Cache Storage unavailable */ }
}
