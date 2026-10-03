// Validation for pitch imports (CSV and TrackMan PDF), shared by the browser
// preview and the server action that saves them (importPitchMetrics).
//
// CSV: the browser sends the header row and each row's cells. The server
// rebuilds every row and maps it with the same code the preview used
// (mapPitchRow in pitch-csv.ts), so a row the preview would have skipped is
// refused on the server too. PDF: rows come from parseTrackmanPDF and are
// checked field by field. Only known columns are kept; clip_id and
// created_by are always set by the server.
import { mapPitchRow, type PitchFields } from './pitch-csv'

export const MAX_IMPORT_ROWS = 2000
const MAX_COLUMNS = 300
const MAX_CELL = 500
const MAX_PITCH_TYPE = 60

export type CsvImport = { source: 'csv'; headers: string[]; rows: string[][] }
export type PdfImportRow = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
}
export type PdfImport = { source: 'pdf'; rows: PdfImportRow[] }
export type PitchImport = CsvImport | PdfImport

/** A row ready to insert, minus clip_id / created_by. */
export type PitchInsert = Omit<PitchFields, 'release_height' | 'extension' | 'vaa'> & {
  extension?: number | null
  vaa?: number | null
  raw_data?: Record<string, string>
}

export type ImportValidation = { ok: true; rows: PitchInsert[] } | { ok: false; error: string }

/** Same axis rule as addPitchMetric: degrees clockwise from 12:00, 0 <= axis < 360. */
export function pitchAxisError(axis: number | null | undefined): string | null {
  if (axis == null) return null
  return Number.isFinite(axis) && axis >= 0 && axis < 360 ? null : 'Axis must be a clock time from 1:00 to 12:59.'
}

const isNum = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))

/** The payload the browser sends for a parsed CSV (header row + cells). */
export function csvImportFrom(rows: { _raw: Record<string, string> }[]): CsvImport {
  const headers = rows.length > 0 ? Object.keys(rows[0]._raw) : []
  return { source: 'csv', headers, rows: rows.map(r => headers.map(h => r._raw[h] ?? '')) }
}

export function validatePitchImport(input: unknown): ImportValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Nothing to import.' }
  const data = input as { source?: unknown; rows?: unknown; headers?: unknown }
  if (!Array.isArray(data.rows) || data.rows.length === 0) return { ok: false, error: 'Nothing to import.' }
  if (data.rows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `This file has ${data.rows.length} pitches; import up to ${MAX_IMPORT_ROWS} at a time.` }
  }
  if (data.source === 'csv') return validateCsv(data.headers, data.rows)
  if (data.source === 'pdf') return validatePdf(data.rows)
  return { ok: false, error: 'Nothing to import.' }
}

function validateCsv(headers: unknown, rows: unknown[]): ImportValidation {
  if (!Array.isArray(headers) || headers.length === 0 || headers.length > MAX_COLUMNS
    || !headers.every(h => typeof h === 'string' && h.length <= MAX_CELL)) {
    return { ok: false, error: 'This CSV couldn\'t be read. Try exporting it again.' }
  }
  const out: PitchInsert[] = []
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]
    const where = `Pitch ${i + 1}`
    if (!Array.isArray(cells) || cells.length !== headers.length || !cells.every(c => typeof c === 'string' && c.length <= MAX_CELL)) {
      return { ok: false, error: `${where} couldn't be read. Nothing was saved.` }
    }
    const raw = Object.fromEntries((headers as string[]).map((h, j) => [h, (cells[j] as string).trim()]))
    const { fields, problems } = mapPitchRow(raw)
    if (problems.length > 0) return { ok: false, error: `${where}: ${problems.join('; ')}. Nothing was saved.` }
    if (fields.pitch_type === null && fields.velocity === null) return { ok: false, error: `${where} has no pitch type or velocity. Nothing was saved.` }
    const axisError = pitchAxisError(fields.spin_axis)
    if (axisError) return { ok: false, error: `${where}: ${axisError} Nothing was saved.` }
    const { release_height: _rh, ...keep } = fields
    void _rh
    out.push({ ...keep, raw_data: raw })
  }
  return { ok: true, rows: out }
}

function validatePdf(rows: unknown[]): ImportValidation {
  const out: PitchInsert[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Partial<Record<keyof PdfImportRow, unknown>> | null
    const where = `Pitch type ${i + 1}`
    if (!r || typeof r !== 'object') return { ok: false, error: `${where} couldn't be read. Nothing was saved.` }
    const pitchType = r.pitch_type
    if (!(pitchType === null || (typeof pitchType === 'string' && pitchType.trim() !== '' && pitchType.length <= MAX_PITCH_TYPE))) {
      return { ok: false, error: `${where} has no pitch type. Nothing was saved.` }
    }
    const nums = ['velocity', 'spin_rate', 'spin_axis', 'horizontal_break', 'vertical_break'] as const
    const bad = nums.find(k => !isNum(r[k] ?? null))
    if (bad) return { ok: false, error: `${where}: ${bad.replace('_', ' ')} isn't a number. Nothing was saved.` }
    const spinRate = (r.spin_rate ?? null) as number | null
    const axis = (r.spin_axis ?? null) as number | null
    const axisError = pitchAxisError(axis)
    if (axisError) return { ok: false, error: `${where}: ${axisError} Nothing was saved.` }
    out.push({
      pitch_type: pitchType === null ? null : pitchType.trim(),
      velocity: (r.velocity ?? null) as number | null,
      spin_rate: spinRate == null ? null : Math.trunc(spinRate),
      spin_axis: axis,
      horizontal_break: (r.horizontal_break ?? null) as number | null,
      vertical_break: (r.vertical_break ?? null) as number | null,
    })
  }
  return { ok: true, rows: out }
}
