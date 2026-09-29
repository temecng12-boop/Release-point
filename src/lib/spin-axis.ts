// Spin axis / tilt helpers.
//
// Storage convention (pitch_metrics.spin_axis): degrees clockwise from 12:00,
// so 12:00 = 0°, 3:00 = 90°, 6:00 = 180°, 9:00 = 270°. Each hour is 30° and
// each minute is 0.5°. This matches the metrics table display and the TrackMan
// PDF "Tilt" import. TrackMan CSV "SpinAxis" degrees use 180° = 12:00 and are
// converted with trackmanSpinAxisToDegrees.

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

/**
 * TrackMan "SpinAxis" degrees → storage degrees.
 *
 * TrackMan (and Statcast) put 180° at 12:00 (pure backspin), 90° at 9:00 and
 * 270° at 3:00, increasing clockwise on the same clock face, so its own "Tilt"
 * column is (SpinAxis − 180) / 30 hours. The app puts 0° at 12:00, so
 * app = (trackman − 180 + 360) mod 360: 180 → 0 (12:00), 270 → 90 (3:00),
 * 0/360 → 180 (6:00), 90 → 270 (9:00). Rounded to 0.01° to drop float noise.
 */
export function trackmanSpinAxisToDegrees(trackman: number): number | null {
  if (!Number.isFinite(trackman)) return null
  const deg = Math.round((((trackman - 180) % 360) + 360) % 360 * 100) / 100
  return deg >= 360 ? deg - 360 : deg
}

/**
 * A spin axis cell from an imported CSV. Clock strings ("1:15", TrackMan's
 * "Tilt" column) are already in the app's clock convention; plain numbers are
 * TrackMan-convention degrees (180° = 12:00). Empty or unparseable → null.
 */
export function parseImportedSpinAxis(value: string | null | undefined): number | null {
  const s = (value ?? '').trim()
  if (s === '') return null
  if (s.includes(':')) {
    const clock = parseClockAxis(s)
    return clock.ok ? clock.degrees : null
  }
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null
  return trackmanSpinAxisToDegrees(Number(s))
}

/**
 * True when Postgres rejected a fractional value for an integer column
 * (pitch_metrics.spin_axis before migration 020 makes it numeric).
 */
export function isIntegerSyntaxError(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === '22P02' && (error.message ?? '').includes('integer')
}

/** Whole-degree fallback for an integer spin_axis column. */
export function roundAxisForIntegerColumn(degrees: number | null): number | null {
  return degrees == null ? null : Math.round(degrees) % 360
}
