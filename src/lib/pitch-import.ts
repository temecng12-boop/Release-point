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
/** next.config.ts serverActions.bodySizeLimit ('4mb' = 4 * 1024 * 1024 bytes). */
export const SERVER_ACTION_BODY_LIMIT_BYTES = 4 * 1024 * 1024
/** What the browser may send: the limit minus room for the request's own encoding overhead. */
export const IMPORT_BODY_LIMIT_BYTES = SERVER_ACTION_BODY_LIMIT_BYTES - 256 * 1024
export const IMPORT_TOO_BIG = 'This file is too big to import at once; split it into smaller files.'
/** TrackMan PDFs sent to parseTrackmanPDF: same budget as an import. */
export const PDF_MAX_BYTES = IMPORT_BODY_LIMIT_BYTES
export const PDF_TOO_BIG = 'This PDF is too big to import. Pick one under 3.75 MB.'

/** Checked in the browser before sending and again on the server. */
export function pdfFileProblem(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === 'application/pdf' || (file.type === '' || file.type === 'application/octet-stream') && /\.pdf$/i.test(file.name)
  if (!isPdf) return 'Please upload a PDF file.'
  if (file.size > PDF_MAX_BYTES) return PDF_TOO_BIG
  if (file.size === 0) return 'This PDF is empty.'
  return null
}
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

/** Columns a client may set on a pitch_metrics row (clip_id / created_by are always the server's). */
export const PITCH_FIELDS = ['pitch_type', 'velocity', 'spin_rate', 'spin_axis', 'horizontal_break', 'vertical_break', 'extension', 'vaa'] as const
const PDF_FIELDS = ['pitch_type', 'velocity', 'spin_rate', 'spin_axis', 'horizontal_break', 'vertical_break'] as const
type PitchField = (typeof PITCH_FIELDS)[number]

/**
 * Check one row field by field and keep only `fields` (anything else the
 * client sent, such as clip_id or created_by, is dropped).
 */
function checkPitchRow(r: unknown, where: string, fields: readonly PitchField[], blankTypeIsError: boolean):
  { ok: true; row: PitchInsert } | { ok: false; error: string } {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: `${where} couldn't be read.` }
  const v = r as Partial<Record<PitchField, unknown>>
  const pitchType = v.pitch_type ?? null
  if (pitchType !== null && (typeof pitchType !== 'string' || pitchType.length > MAX_PITCH_TYPE)) {
    return { ok: false, error: `${where}: the pitch type isn't valid.` }
  }
  const type = typeof pitchType === 'string' && pitchType.trim() !== '' ? pitchType.trim() : null
  if (blankTypeIsError && pitchType !== null && type === null) return { ok: false, error: `${where} has no pitch type.` }
  const bad = fields.filter(k => k !== 'pitch_type').find(k => !isNum(v[k] ?? null))
  if (bad) return { ok: false, error: `${where}: ${bad.replace('_', ' ')} isn't a number.` }
  const axisError = pitchAxisError((v.spin_axis ?? null) as number | null)
  if (axisError) return { ok: false, error: `${where}: ${axisError}` }
  const row: Record<string, unknown> = { pitch_type: type }
  for (const k of fields) if (k !== 'pitch_type') row[k] = v[k] ?? null
  if (row.spin_rate != null) row.spin_rate = Math.trunc(row.spin_rate as number)
  return { ok: true, row: row as PitchInsert }
}

/** One manually entered pitch (addPitchMetric): same checks and field list as imports. */
export function validateManualPitch(data: unknown): { ok: true; row: PitchInsert } | { ok: false; error: string } {
  const r = checkPitchRow(data, 'This pitch', PITCH_FIELDS, false)
  if (!r.ok) return { ok: false, error: r.error.replace(/^This pitch: /, '').replace(/^./, c => c.toUpperCase()) }
  return r
}

function validatePdf(rows: unknown[]): ImportValidation {
  const out: PitchInsert[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = checkPitchRow(rows[i], `Pitch type ${i + 1}`, PDF_FIELDS, true)
    if (!r.ok) return { ok: false, error: `${r.error} Nothing was saved.` }
    out.push(r.row)
  }
  return { ok: true, rows: out }
}

/**
 * UTF-8 size of the action call's arguments as JSON, which is about what the
 * request body carries (React encodes plain arguments as JSON text). Checked
 * in the browser before sending, so a file over the server action body limit
 * gets a clear message instead of a failed request.
 */
export function importPayloadBytes(clipId: string, input: PitchImport): number {
  return new TextEncoder().encode(JSON.stringify([clipId, input])).length
}

export function importTooBig(clipId: string, input: PitchImport): string | null {
  return importPayloadBytes(clipId, input) > IMPORT_BODY_LIMIT_BYTES ? IMPORT_TOO_BIG : null
}
