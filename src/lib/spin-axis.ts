// Spin axis / tilt helpers.
//
// Storage convention (pitch_metrics.spin_axis): degrees clockwise from 12:00,
// so 12:00 = 0°, 3:00 = 90°, 6:00 = 180°, 9:00 = 270°. Each hour is 30° and
// each minute is 0.5°. This matches the metrics table display and the TrackMan
// PDF "Tilt" import.

export type AxisParseResult =
  | { ok: true; degrees: number | null }
  | { ok: false; error: string }

const CLOCK_RE = /^(\d{1,2}):(\d{2})$/

export const AXIS_FORMAT_HINT = 'Enter axis as clock time from 1:00 to 12:59, e.g. 1:15 or 8:45.'

/** Clock time (hours 1–12, minutes 0–59) → degrees in the storage convention. */
export function clockToDegrees(hours: number, minutes: number): number {
  return (hours % 12) * 30 + minutes * 0.5
}

/**
 * Parse a clock-format axis ("8:45"). Empty input is valid and means "no
 * axis". Anything else must be H:MM or HH:MM with hours 1–12 and minutes 00–59.
 */
export function parseClockAxis(input: string | null | undefined): AxisParseResult {
  const s = (input ?? '').trim()
  if (s === '') return { ok: true, degrees: null }
  const m = CLOCK_RE.exec(s)
  if (!m) return { ok: false, error: AXIS_FORMAT_HINT }
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours < 1 || hours > 12 || minutes > 59) return { ok: false, error: AXIS_FORMAT_HINT }
  return { ok: true, degrees: clockToDegrees(hours, minutes) }
}

/** Degrees (storage convention) → "H:MM", rounded to the nearest minute. */
export function degreesToClock(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  const totalMinutes = Math.round(normalized * 2) % 720
  const h = Math.floor(totalMinutes / 60) || 12
  const m = totalMinutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
