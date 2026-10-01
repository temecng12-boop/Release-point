// "Clear marks" deletes only the caller's own saved marks on the server
// (clearAnnotations). The screen drops exactly those; marks added by someone
// else, or not saved yet (no id), stay visible.
export function marksAfterClear<T extends { id?: string }>(marks: T[], removedIds: readonly string[]) {
  const removedSet = new Set(removedIds)
  const kept = marks.filter(m => !m.id || !removedSet.has(m.id))
  return { kept, removed: marks.length - kept.length }
}
