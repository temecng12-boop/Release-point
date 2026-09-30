/**
 * Reload once when a new service worker takes control.
 * Run with: npx tsx --test src/lib/__tests__/sw-reload.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideSwReload, fieldIsDirty, installSwReload, pageIsBusy, trackRecorders, SW_RELOAD_GUARD_MS, SW_RELOAD_KEY, SW_BUSY_RETRY_MS } from '../sw-reload'

test('decision: first install never reloads; loop guard; busy waits', () => {
  const base = { hadController: true, reloadedAt: null, now: 1_000_000, busy: false }
  assert.equal(decideSwReload(base), 'reload')
  assert.equal(decideSwReload({ ...base, hadController: false }), 'first-install')
  assert.equal(decideSwReload({ ...base, reloadedAt: base.now - 5_000 }), 'loop-guard')
  assert.equal(decideSwReload({ ...base, reloadedAt: base.now - SW_RELOAD_GUARD_MS }), 'reload')
  assert.equal(decideSwReload({ ...base, busy: true }), 'busy')
})

function env(o: { controller?: unknown; busy?: () => boolean; stored?: string | null } = {}) {
  let t = 1_000_000
  const listeners: (() => void)[] = [], timers: { f: () => void; at: number }[] = []
  const store = new Map<string, string>(o.stored ? [[SW_RELOAD_KEY, o.stored]] : [])
  let reloads = 0
  const e = {
    sw: { controller: 'controller' in o ? o.controller : {}, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: (_: string, f: () => void) => listeners.splice(listeners.indexOf(f), 1) },
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    now: () => t, isBusy: o.busy ?? (() => false), reload: () => { reloads++ },
    setTimeout: (f: () => void, ms: number) => { const h = { f, at: t + ms }; timers.push(h); return h },
    clearTimeout: (h: unknown) => { timers.splice(timers.indexOf(h as never), 1) },
  }
  return { e, fire: () => listeners.slice().forEach(f => f()), listeners, store, timers, advance: (ms: number) => { t += ms; for (const h of timers.splice(0)) h.f() }, get reloads() { return reloads } }
}

test('reloads exactly once per page, records the time, and not again right after', () => {
  const x = env()
  const off = installSwReload(x.e)
  x.fire(); x.fire()
  assert.equal(x.reloads, 1)
  assert.equal(x.store.get(SW_RELOAD_KEY), '1000000')
  off(); assert.equal(x.listeners.length, 0)
  // The reloaded page sees another controllerchange at once: guard stops a loop.
  const y = env({ stored: '995000' })
  installSwReload(y.e); y.fire()
  assert.equal(y.reloads, 0)
})

test('first install (no controller at load) does not reload', () => {
  const x = env({ controller: null })
  installSwReload(x.e); x.fire()
  assert.equal(x.reloads, 0)
})

test('busy page (recording / unsaved input) waits and reloads once idle', () => {
  let busy = true
  const x = env({ busy: () => busy })
  installSwReload(x.e); x.fire()
  assert.equal(x.reloads, 0)
  assert.equal(x.timers.length, 1)
  x.advance(SW_BUSY_RETRY_MS); assert.equal(x.reloads, 0)
  busy = false
  x.advance(SW_BUSY_RETRY_MS); assert.equal(x.reloads, 1)
})

test('busy detection: recorders, marked editors, dirty uncontrolled fields, focused text', () => {
  const doc = (fields: object[] = [], marked = false, active: unknown = null) => ({ querySelector: () => (marked ? {} : null), querySelectorAll: () => fields, activeElement: active })
  assert.equal(pageIsBusy(doc(), 0), false)
  assert.equal(pageIsBusy(doc(), 1), true)
  assert.equal(pageIsBusy(doc([], true), 0), true)
  assert.equal(pageIsBusy(doc([{ tagName: 'TEXTAREA', value: 'hi', defaultValue: '' }]), 0), true)
  assert.equal(pageIsBusy(doc([{ tagName: 'INPUT', type: 'text', value: 'a', defaultValue: 'a' }]), 0), false)
  assert.equal(pageIsBusy(doc([], false, { tagName: 'INPUT', type: 'text', value: 'typing' }), 0), true)
  assert.equal(pageIsBusy(doc([], false, { tagName: 'INPUT', type: 'checkbox', value: 'on' }), 0), false)
  assert.equal(fieldIsDirty({ tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: false }), true)
  assert.equal(fieldIsDirty({ tagName: 'INPUT', type: 'hidden', value: 'x', defaultValue: '' }), false)
})

test('trackRecorders counts start until stop/error, and wraps only once', () => {
  class R { handlers: Record<string, () => void> = {}; state = 'inactive'; addEventListener(t: string, f: () => void) { this.handlers[t] = f }; start() { this.state = 'recording' } }
  const active = new Set<R>()
  trackRecorders(R.prototype as never, active as never); trackRecorders(R.prototype as never, active as never)
  const r = new R(); r.start()
  assert.equal(active.size, 1); assert.equal(r.state, 'recording')
  r.handlers.stop(); assert.equal(active.size, 0)
})
