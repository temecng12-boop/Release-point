// redirect() throws like Next's: an error whose digest starts with NEXT_REDIRECT.
export class RedirectSignal extends Error {
  digest: string
  constructor(public url: string) { super('NEXT_REDIRECT'); this.digest = `NEXT_REDIRECT;replace;${url};307;` }
}
export function redirect(url: string): never { throw new RedirectSignal(url) }
export function forbidden(): never {
  const error = new Error('Forbidden')
  ;(error as { digest?: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;403'
  throw error
}
export function unauthorized(): never {
  const error = new Error('Unauthorized')
  ;(error as { digest?: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;401'
  throw error
}
