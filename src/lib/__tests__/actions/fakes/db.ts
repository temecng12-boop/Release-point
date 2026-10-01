// In-memory stand-in for the Supabase service client used by server actions.
// Enough of the query builder for these tests, plus failure injection:
// fail({ table, action }) makes matching calls return { error } and change nothing.

export type Row = Record<string, unknown>
export type DbError = { code?: string; message: string }
type Action = 'select' | 'insert' | 'update' | 'upsert' | 'delete'
type Filter = { kind: 'eq' | 'is' | 'in'; column: string; value: unknown }
export type Op = { table: string; action: Action; values?: unknown; filters: Filter[] }
type Failure = { table?: string; action?: Action; bucket?: string; error: DbError; times?: number }

export const state = {
  tables: {} as Record<string, Row[]>,
  storage: {} as Record<string, string[]>,
  user: null as null | { id: string; email?: string; user_metadata?: Record<string, unknown> },
  failures: [] as Failure[],
  ops: [] as Op[],
  storageOps: [] as { bucket: string; paths: string[] }[],
  revalidated: [] as string[],
}

let nextId = 1

export function resetFake(init: { tables?: Record<string, Row[]>; storage?: Record<string, string[]>; user?: typeof state.user } = {}) {
  state.tables = structuredClone(init.tables ?? {})
  state.storage = structuredClone(init.storage ?? {})
  state.user = init.user ?? null
  state.failures = []
  state.ops = []
  state.storageOps = []
  state.revalidated = []
}

/** Make matching calls fail. `times` limits how many calls fail (default: all). */
export function fail(f: Failure) { state.failures.push(f) }

function takeFailure(match: (f: Failure) => boolean): DbError | null {
  const f = state.failures.find(x => (x.times === undefined || x.times > 0) && match(x))
  if (!f) return null
  if (f.times !== undefined) f.times--
  return f.error
}

function matches(row: Row, filters: Filter[]) {
  return filters.every(f => {
    if (f.kind === 'eq') return row[f.column] === f.value
    if (f.kind === 'is') return (row[f.column] ?? null) === f.value
    return (f.value as unknown[]).includes(row[f.column])
  })
}

function project(row: Row, columns: string | undefined) {
  if (!columns || columns.trim() === '*') return { ...row }
  return Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, row[c] ?? null]))
}

class Query implements PromiseLike<{ data: unknown; error: DbError | null }> {
  private action: Action = 'select'
  private values: unknown
  private filters: Filter[] = []
  private columns: string | undefined
  private returning = false
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'
  private max: number | undefined
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  constructor(private table: string) {}

  select(columns = '*') { if (this.action === 'select') this.columns = columns; else { this.returning = true; this.columns = columns } return this }
  insert(values: Row | Row[]) { this.action = 'insert'; this.values = values; return this }
  update(values: Row) { this.action = 'update'; this.values = values; return this }
  upsert(values: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.action = 'upsert'; this.values = values; this.upsertOpts = opts; return this }
  delete() { this.action = 'delete'; return this }
  eq(column: string, value: unknown) { this.filters.push({ kind: 'eq', column, value }); return this }
  is(column: string, value: unknown) { this.filters.push({ kind: 'is', column, value }); return this }
  in(column: string, value: unknown[]) { this.filters.push({ kind: 'in', column, value }); return this }
  order() { return this }
  limit(n: number) { this.max = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybeSingle'; return this }

  private run(): { data: unknown; error: DbError | null } {
    state.ops.push({ table: this.table, action: this.action, values: this.values, filters: this.filters })
    const error = takeFailure(f => f.bucket === undefined && (f.table === undefined || f.table === this.table) && (f.action === undefined || f.action === this.action))
    if (error) return { data: null, error }
    const rows = (state.tables[this.table] ??= [])
    let out: Row[] = []
    if (this.action === 'select') {
      out = rows.filter(r => matches(r, this.filters))
    } else if (this.action === 'insert') {
      const list = (Array.isArray(this.values) ? this.values : [this.values]) as Row[]
      out = list.map(v => ({ id: `id-${nextId++}`, ...v }))
      rows.push(...out)
    } else if (this.action === 'update') {
      out = rows.filter(r => matches(r, this.filters))
      for (const r of out) Object.assign(r, this.values as Row)
    } else if (this.action === 'upsert') {
      const key = this.upsertOpts.onConflict ?? 'id'
      for (const v of (Array.isArray(this.values) ? this.values : [this.values]) as Row[]) {
        const existing = rows.find(r => r[key] === v[key])
        if (existing) { if (!this.upsertOpts.ignoreDuplicates) { Object.assign(existing, v); out.push(existing) } }
        else { const r = { ...v }; rows.push(r); out.push(r) }
      }
    } else {
      out = rows.filter(r => matches(r, this.filters))
      state.tables[this.table] = rows.filter(r => !out.includes(r))
    }
    if (this.max !== undefined) out = out.slice(0, this.max)
    if (this.action !== 'select' && !this.returning) return { data: null, error: null }
    const data = out.map(r => project(r, this.columns))
    if (this.mode === 'many') return { data, error: null }
    if (data.length === 1) return { data: data[0], error: null }
    if (data.length === 0 && this.mode === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `JSON object requested, ${data.length} rows returned` } }
  }

  then<A = { data: unknown; error: DbError | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: DbError | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

export const fakeClient = {
  from: (table: string) => new Query(table),
  storage: {
    from: (bucket: string) => ({
      async upload(path: string) {
        state.storage[bucket] = [...(state.storage[bucket] ?? []), path]
        return { data: { path }, error: null }
      },
      async createSignedUrl(path: string) {
        return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` }, error: null }
      },
      async remove(paths: string[]) {
        state.storageOps.push({ bucket, paths })
        const error = takeFailure(f => f.bucket === bucket)
        if (error) return { data: null, error }
        state.storage[bucket] = (state.storage[bucket] ?? []).filter(p => !paths.includes(p))
        return { data: paths.map(name => ({ name })), error: null }
      },
    }),
  },
}
