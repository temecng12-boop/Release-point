// Minimal in-memory stand-in for the service-role Supabase client used by
// server-side helpers in tests. Supports select/eq/in/not/order/limit/
// maybeSingle, insert, update().eq, delete().eq and storage.remove.
type Row = Record<string, unknown>
export type FakeTables = Record<string, Row[] | 'missing'>
type Err = { code: string; message: string }

export function fakeSupabase(tables: FakeTables, opts: { failInsert?: Record<string, Err>; failSelect?: Record<string, Err>; missingColumns?: Record<string, string[]> } = {}) {
  const log: string[] = []
  const removed: string[] = []
  const missing = (t: string): Err => ({ code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` })
  const rowsOf = (t: string) => { const r = tables[t]; return r === 'missing' ? null : (r ?? (tables[t] = [])) as Row[] }

  function query(t: string, cols: string) {
    const filters: ((r: Row) => boolean)[] = []
    let orderBy: { c: string; asc: boolean } | null = null
    let lim: number | null = null
    const filterCols: string[] = []
    const pick = (r: Row) => cols === '*' ? { ...r } : Object.fromEntries(cols.split(',').map(c => c.trim()).map(c => [c, r[c] ?? null]))
    const run = () => {
      const rows = rowsOf(t)
      if (!rows) return { data: null, error: missing(t) }
      if (opts.failSelect?.[t]) return { data: null, error: opts.failSelect[t] }
      const absent = (opts.missingColumns?.[t] ?? []).find(c => cols.split(',').map(x => x.trim()).includes(c) || filterCols.includes(c))
      if (absent) return { data: null, error: { code: '42703', message: `column ${t}.${absent} does not exist` } }
      let out = rows.filter(r => filters.every(f => f(r)))
      if (orderBy) { const { c, asc } = orderBy; out = [...out].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (asc ? 1 : -1)) }
      if (lim != null) out = out.slice(0, lim)
      return { data: out.map(pick), error: null }
    }
    const q = {
      eq(c: string, v: unknown) { filterCols.push(c); filters.push(r => r[c] === v); return q },
      in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q },
      not(c: string, _op: string, v: unknown) { filterCols.push(c); filters.push(r => r[c] !== v && r[c] !== undefined); return q },
      order(c: string, o: { ascending: boolean }) { orderBy = { c, asc: o.ascending }; return q },
      limit(n: number) { lim = n; return q },
      maybeSingle() { const r = run(); return Promise.resolve(r.error ? r : { data: r.data![0] ?? null, error: null }) },
      single() { return q.maybeSingle() },
      then(res: (v: ReturnType<typeof run>) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej) },
    }
    return q
  }

  const client = {
    from(t: string) {
      return {
        select: (cols: string) => query(t, cols),
        insert(v: Row) {
          log.push(`insert ${t}`)
          if (opts.failInsert?.[t]) return Promise.resolve({ error: opts.failInsert[t] })
          const rows = rowsOf(t); if (!rows) return Promise.resolve({ error: missing(t) })
          rows.push({ id: `${t}-${rows.length + 1}`, created_at: new Date(Date.now() + rows.length).toISOString(), ...v })
          return Promise.resolve({ error: null })
        },
        update(v: Row) {
          return { eq(c: string, val: unknown) {
            log.push(`update ${t}`)
            const rows = rowsOf(t); if (!rows) return Promise.resolve({ error: missing(t) })
            for (const r of rows) if (r[c] === val) Object.assign(r, v)
            return Promise.resolve({ error: null })
          } }
        },
        delete() {
          return { eq(c: string, val: unknown) {
            log.push(`delete ${t}`)
            const rows = rowsOf(t); if (!rows) return Promise.resolve({ error: missing(t) })
            tables[t] = rows.filter(r => r[c] !== val)
            return Promise.resolve({ error: null })
          } }
        },
      }
    },
    storage: { from(b: string) { return { remove(paths: string[]) { removed.push(...paths.map(p => `${b}:${p}`)); return Promise.resolve({ error: null }) } } } },
  }
  return { client, log, removed, tables }
}
