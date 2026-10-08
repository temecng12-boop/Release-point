/** Dev-only routes (screenshot pages). Off in production unless explicitly enabled. */
export function devPagesEnabled(env: NodeJS.Dict<string> = process.env): boolean {
  return env.ENABLE_DEV_PAGES === '1'
}
