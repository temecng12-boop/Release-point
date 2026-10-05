// next/headers stand-in: cookies() reads and writes state.cookies.
import { state } from './db'

export async function cookies() {
  return {
    get: (name: string) => (state.cookies[name] ? { name, value: state.cookies[name].value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => { state.cookies[name] = { value, options } },
    delete: (name: string) => { delete state.cookies[name] },
  }
}
