// Server-Component 403. Next.js renders throws whose digest is
// NEXT_HTTP_ERROR_FALLBACK;403 as an HTTP 403 (authInterrupts / forbidden()).
export function forbidden(): never {
  const error = new Error('Forbidden')
  ;(error as { digest?: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;403'
  throw error
}
