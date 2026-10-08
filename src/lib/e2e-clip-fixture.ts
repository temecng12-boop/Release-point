/**
 * Local Playwright fixture for the real clip and compare routes.
 * Off unless PLAYWRIGHT_CLIP_FIXTURE=1, so production still requires auth + DB.
 */

export const E2E_CLIP_A = '00000000-0000-4000-a000-000000000001'
export const E2E_CLIP_B = '00000000-0000-4000-a000-000000000002'
export const E2E_PLAYER_ID = '00000000-0000-4000-a000-0000000000aa'
export const E2E_CLIP_SRC = '/e2e-clip.mp4'

export function e2eClipFixtureEnabled(): boolean {
  return process.env.PLAYWRIGHT_CLIP_FIXTURE === '1'
}

export function isE2eClipId(id: string | undefined | null): boolean {
  return id === E2E_CLIP_A || id === E2E_CLIP_B
}

export function isE2eClipFixture(id: string | undefined | null): boolean {
  return e2eClipFixtureEnabled() && isE2eClipId(id)
}

/** Middleware + compare-page gate: fixture clip URLs only. */
export function isE2eClipFixtureRequest(pathname: string, searchParams?: URLSearchParams): boolean {
  if (!e2eClipFixtureEnabled()) return false
  if (pathname === '/clips/compare') {
    return isE2eClipId(searchParams?.get('a')) && isE2eClipId(searchParams?.get('b'))
  }
  if (!pathname.startsWith('/clips/')) return false
  return isE2eClipId(pathname.slice('/clips/'.length))
}
