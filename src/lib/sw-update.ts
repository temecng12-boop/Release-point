// Detects when a new service worker takes over an open page, so the page can
// offer "New version available – Reload". Nothing reloads by itself: the user
// may have unsaved typing or drawings that the page can't see.

type Sw = {
  controller: unknown
  addEventListener(t: 'controllerchange', f: () => void): void
  removeEventListener(t: 'controllerchange', f: () => void): void
}

/**
 * Calls `onUpdate` once when a new worker takes control of a page that already
 * had one. The first worker claiming a page (first install) is not an update.
 * Returns a cleanup.
 */
export function watchSwUpdate(sw: Sw, onUpdate: () => void): () => void {
  let hadController = !!sw.controller
  let notified = false
  const onChange = () => {
    if (!hadController) { hadController = true; return }
    if (notified) return
    notified = true
    onUpdate()
  }
  sw.addEventListener('controllerchange', onChange)
  return () => sw.removeEventListener('controllerchange', onChange)
}
