// Minimal in-memory Supabase for recordConsent: select/eq/single, update/eq,
// and upsert with Postgres ON CONFLICT semantics (ignoreDuplicates = DO NOTHING).
type Row = Record<string, unknown>
export const db = { tables: {} as Record<string, Row[]>, user: null as null | { id: string; email: string } }

function query(table: string) {
  const filters: [string, unknown][] = []
  let op: { kind: 'select' } | { kind: 'update'; values: Row } = { kind: 'select' }
  const rows = () => (db.tables[table] ??= [])
  const matched = () => rows().filter(r => filters.every(([c, v]) => r[c] === v))
  const builder = {
    select: () => builder,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return builder },
    update: (values: Row) => { op = { kind: 'update', values }; return builder },
    single: async () => {
      const m = matched()
      return m.length === 1 ? { data: m[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }
    },
    upsert: async (value: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) => {
      const key = opts.onConflict ?? 'id'
      const existing = rows().find(r => r[key] === value[key])
      if (!existing) rows().push({ ...value })
      else if (!opts.ignoreDuplicates) Object.assign(existing, value)
      return { data: null, error: null }
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (op.kind === 'update') for (const r of matched()) Object.assign(r, op.values)
      return Promise.resolve({ data: op.kind === 'select' ? matched() : null, error: null }).then(resolve)
    },
  }
  return builder
}

export const supabaseAdmin = { from: query }
export async function createClient() {
  return { auth: { getUser: async () => ({ data: { user: db.user }, error: null }) } }
}
export class RedirectSignal extends Error {
  digest: string
  constructor(public url: string) { super('NEXT_REDIRECT'); this.digest = `NEXT_REDIRECT;replace;${url};307;` }
}
export function redirect(url: string): never { throw new RedirectSignal(url) }
