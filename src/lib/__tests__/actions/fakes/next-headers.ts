// next/headers stand-in: cookies() reads and writes state.cookies.
import { state } from './db'

export const headerState: Record<string, string> = {}

export function resetHeaders(init: Record<string, string> = {}) {
  for (const k of Object.keys(headerState)) delete headerState[k]
  Object.assign(headerState, init)
}

export async function headers() {
  return {
    get: (name: string) => headerState[name.toLowerCase()] ?? headerState[name] ?? null,
  }
}

export async function cookies() {
  return {
    get: (name: string) => (state.cookies[name] ? { name, value: state.cookies[name].value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => { state.cookies[name] = { value, options } },
    delete: (name: string) => { delete state.cookies[name] },
  }
}
