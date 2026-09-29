// Turn Supabase/PostgREST errors into user-facing copy while logging the real
// cause on the server (and showing it in development).

export type DbErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** Postgres/PostgREST codes that mean the live schema is behind the code. */
const SCHEMA_CODES = new Set(['PGRST204', 'PGRST205', '42703', '42P01'])

/** A short, reasonable explanation for the user, based on the error code. */
export function friendlyDbMessage(error: DbErrorLike | null | undefined, fallback: string): string {
  const code = error?.code ?? ''
  if (SCHEMA_CODES.has(code)) {
    return `${fallback} The database is missing an update this feature needs. Please contact support.`
  }
  if (code === '42P17' || code === '42501') {
    return `${fallback} A database permission check failed. Please contact support.`
  }
  if (code === '22P02' || code === '23502' || code === '23514') {
    return `${fallback} One of the values wasn't accepted. Check the fields and try again.`
  }
  return `${fallback} Please try again.`
}

/**
 * Log the full error server-side and return a message for the UI. In
 * development the raw database message is appended so the cause is obvious.
 */
export function describeDbError(
  context: string,
  error: DbErrorLike | null | undefined,
  fallback: string,
): string {
  console.error(`[${context}]`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  })
  const friendly = friendlyDbMessage(error, fallback)
  if (process.env.NODE_ENV !== 'production' && error?.message) {
    return `${friendly} (${error.code ? `${error.code}: ` : ''}${error.message})`
  }
  return error?.code ? `${friendly} (code ${error.code})` : friendly
}

/** True when a PostgREST error says `column` doesn't exist on the table. */
export function isMissingColumnError(error: DbErrorLike | null | undefined, column: string): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const msg = error.message ?? ''
  return (code === 'PGRST204' || code === '42703') && msg.includes(column)
}
