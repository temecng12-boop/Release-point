// Which storage objects to remove when a clip is deleted (RP-041). Pure.

/**
 * Returns the clip's stored file paths (video, voice note)
 * that sit in this player's folder of the clips bucket (`<playerId>/...`),
 * without duplicates. Anything else is skipped, so a bad path on the row can
 * never delete another player's files.
 */
export function clipFilesToRemove(
  playerId: string,
  paths: readonly (string | null | undefined)[],
): string[] {
  if (!playerId) return []
  const prefix = `${playerId}/`
  const out: string[] = []
  for (const p of paths) {
    if (typeof p !== 'string' || !p.startsWith(prefix) || p.length === prefix.length) continue
    if (p.includes('..') || p.includes('//')) continue
    if (!out.includes(p)) out.push(p)
  }
  return out
}
