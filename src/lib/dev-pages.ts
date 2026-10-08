/**
 * Dev-only routes (screenshot / Playwright pages). On only when
 * ENABLE_DEV_PAGES=1 and this is not a Vercel deploy (VERCEL is always
 * set there). Playwright's webServer is `next dev` and does not set VERCEL.
 */
export function devPagesEnabled(env: NodeJS.Dict<string> = process.env): boolean {
  return env.ENABLE_DEV_PAGES === '1' && !env.VERCEL
}
