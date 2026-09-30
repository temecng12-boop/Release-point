// When a new service worker takes control (skipWaiting + clients.claim), reload
// open pages once so phones don't keep showing a page rendered under the old
// worker. Not on first install, never in a loop, and not while the page is busy
// (recording, or a form with unsaved input); a busy page is reloaded once it
// is idle again.

export const SW_RELOAD_KEY = 'rp-sw-reloaded-at'
export const SW_RELOAD_GUARD_MS = 60_000
export const SW_BUSY_RETRY_MS = 5_000
export const SW_BUSY_GIVE_UP_MS = 10 * 60_000

export type SwReloadDecision = 'reload' | 'first-install' | 'loop-guard' | 'busy'

/** Pure: what to do on controllerchange. */
export function decideSwReload(s: { hadController: boolean; reloadedAt: number | null; now: number; busy: boolean }): SwReloadDecision {
  if (!s.hadController) return 'first-install'   // the first worker claiming a page changes nothing
  if (s.reloadedAt != null && s.now - s.reloadedAt >= 0 && s.now - s.reloadedAt < SW_RELOAD_GUARD_MS) return 'loop-guard'
  if (s.busy) return 'busy'
  return 'reload'
}

type FieldLike = { tagName: string; type?: string; value?: string; defaultValue?: string; checked?: boolean; defaultChecked?: boolean; readOnly?: boolean; disabled?: boolean }

/** Pure: does this form field hold input that differs from what the page loaded with? */
export function fieldIsDirty(el: FieldLike): boolean {
  if (el.disabled || el.readOnly) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return el.checked !== el.defaultChecked
  if (tag === 'INPUT' && ['button', 'submit', 'reset', 'hidden', 'file', 'image', 'range', 'color'].includes(el.type ?? '')) return false
  if (tag === 'INPUT' || tag === 'TEXTAREA') return (el.value ?? '') !== (el.defaultValue ?? '')
  return false
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password', ''])

type Doc = {
  querySelector(sel: string): unknown
  querySelectorAll(sel: string): ArrayLike<unknown>
  activeElement: unknown
}

/**
 * Cheap "don't reload now" check:
 * - an active MediaRecorder (tracked by `trackRecorders`),
 * - any element marked `data-unsaved="true"` (controlled editors mark themselves),
 * - an uncontrolled field that differs from its default,
 * - the focused text field has text in it (the user is typing).
 */
export function pageIsBusy(doc: Doc, activeRecorders: number): boolean {
  if (activeRecorders > 0) return true
  if (doc.querySelector('[data-unsaved="true"]')) return true
  const fields = Array.from(doc.querySelectorAll('input, textarea') as ArrayLike<FieldLike>)
  if (fields.some(fieldIsDirty)) return true
  const a = doc.activeElement as FieldLike | null
  if (a && typeof a.tagName === 'string' && !a.readOnly && !a.disabled
    && (/^TEXTAREA$/i.test(a.tagName) || (/^INPUT$/i.test(a.tagName) && TEXT_INPUTS.has(a.type ?? 'text')))
    && (a.value ?? '').trim() !== '') return true
  return false
}

type RecorderProto = { start: (...a: unknown[]) => unknown; __rpTracked?: boolean }
type RecorderLike = { state?: string; addEventListener(t: string, f: () => void): void }

/** Counts recordings in progress by wrapping MediaRecorder.prototype.start once. */
export function trackRecorders(proto: RecorderProto | undefined, active: Set<RecorderLike>): void {
  if (!proto || proto.__rpTracked) return
  const start = proto.start
  proto.start = function (this: RecorderLike, ...args: unknown[]) {
    active.add(this)
    const done = () => active.delete(this)
    this.addEventListener('stop', done)
    this.addEventListener('error', done)
    return start.apply(this, args)
  }
  proto.__rpTracked = true
}

export type SwReloadEnv = {
  sw: { controller: unknown; addEventListener(t: 'controllerchange', f: () => void): void; removeEventListener(t: 'controllerchange', f: () => void): void }
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null
  now: () => number
  isBusy: () => boolean
  reload: () => void
  setTimeout: (f: () => void, ms: number) => unknown
  clearTimeout: (h: unknown) => void
}

/** Wires the listener; returns a cleanup. */
export function installSwReload(env: SwReloadEnv): () => void {
  const hadController = !!env.sw.controller
  let done = false
  let timer: unknown = null
  const startedAt = env.now()
  const readAt = () => { const v = Number(env.storage?.getItem(SW_RELOAD_KEY)); return Number.isFinite(v) && v > 0 ? v : null }
  const attempt = (): void => {
    timer = null
    if (done) return
    const decision = decideSwReload({ hadController, reloadedAt: readAt(), now: env.now(), busy: env.isBusy() })
    if (decision === 'busy') {
      if (env.now() - startedAt < SW_BUSY_GIVE_UP_MS) timer = env.setTimeout(attempt, SW_BUSY_RETRY_MS)
      return
    }
    done = true
    if (decision !== 'reload') return
    try { env.storage?.setItem(SW_RELOAD_KEY, String(env.now())) } catch { /* private mode: in-memory guard still applies */ }
    env.reload()
  }
  const onChange = () => { if (!done && timer === null) attempt() }
  env.sw.addEventListener('controllerchange', onChange)
  return () => {
    env.sw.removeEventListener('controllerchange', onChange)
    if (timer !== null) env.clearTimeout(timer)
  }
}
