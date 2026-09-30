// Supabase (service-role) adapters for src/lib/account-deletion.ts.
import type { DeletionDb, DeletionStorage, DbError, Filters, Row } from './account-deletion'

type Q = {
  eq(c: string, v: string): Q
  in(c: string, v: string[]): Q
  then: PromiseLike<{ data: unknown; error: DbError | null }>['then']
}
type Client = {
  from(t: string): { select(c: string): Q; update(v: Row): Q; delete(): Q }
  storage: { from(b: string): {
    list(folder: string, opts: { limit: number; offset: number; search?: string }): Promise<{ data: { name: string; id: string | null }[] | null; error: DbError | null }>
    remove(paths: string[]): Promise<{ error: DbError | null }>
  } }
}

function applyFilters(q: Q, filters: Filters): Q {
  for (const [col, vals] of Object.entries(filters)) q = vals.length === 1 ? q.eq(col, vals[0]) : q.in(col, vals)
  return q
}

const bucketMissing = (e: DbError | null) => !!e && /bucket not found/i.test(e.message)

export function supabaseDeletionDb(client: unknown): DeletionDb {
  const c = client as Client
  return {
    async select(table, columns, filters) {
      const { data, error } = await applyFilters(c.from(table).select(columns), filters)
      return error ? { error } : { rows: (data as Row[] | null) ?? [] }
    },
    async update(table, set, filters) {
      const { error } = await applyFilters(c.from(table).update(set), filters)
      return { error }
    },
    async delete(table, filters) {
      const { error } = await applyFilters(c.from(table).delete(), filters)
      return { error }
    },
  }
}

export function supabaseDeletionStorage(client: unknown): DeletionStorage {
  const c = client as Client
  const LIMIT = 1000
  return {
    async list(bucket, folder, search) {
      const files: string[] = [], folders: string[] = []
      for (let offset = 0; ; offset += LIMIT) {
        const { data, error } = await c.storage.from(bucket).list(folder, { limit: LIMIT, offset, ...(search ? { search } : {}) })
        if (error) return bucketMissing(error) ? { files: [], folders: [] } : { error }
        for (const item of data ?? []) (item.id === null ? folders : files).push(item.name)
        if ((data ?? []).length < LIMIT) break
      }
      return { files, folders }
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return {}
      const { error } = await c.storage.from(bucket).remove(paths)
      return { error: bucketMissing(error) ? null : error }
    },
  }
}
