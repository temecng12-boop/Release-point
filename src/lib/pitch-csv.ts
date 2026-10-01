// Pitch-data CSV import (QA-014). Pure (no React, no Supabase), so the clip
// page's metrics tab and the unit tests use the same code.
//
// parseCsv is a small RFC 4180 reader: quoted fields may contain commas,
// line breaks and doubled quotes (""); CRLF, LF and CR line endings and a
// leading UTF-8 BOM are accepted. It only uses plain string operations, so it
// behaves the same in Safari/WebKit and Chromium.
//
// A quote in the middle of an unquoted value (6'2") or text right after a
// closing quote ("a"b) is kept as text, and the line is listed in `warnings`
// so the user can check that row.
//
// readPitchCsv turns the text into pitch rows and never drops a row silently:
// rows whose column count differs from the header, rows with a number that
// can't be read, and rows with no pitch type or velocity are returned in
// `skipped` with the reason, for the page to show.

import { parseImportedSpinAxis } from './spin-axis'

// Column aliases: device-specific CSV headers -> our DB fields (unchanged).
export const COLUMN_MAP = {
  pitch_type:     ['Pitch Type', 'PitchType', 'Type', 'AutoPitchType', 'TaggedPitchType'],
  velocity:       ['Velocity', 'Speed (mph)', 'RelSpeed', 'Pitch Speed', 'ReleaseSpeed'],
  spin_rate:      ['Spin Rate (rpm)', 'SpinRate', 'Spin Rate', 'SpinRpm'],
  spin_axis:      ['Spin Axis (deg)', 'SpinAxis', 'Spin Axis', 'SpinAxis2d'],
  tilt:           ['Tilt'],   // TrackMan clock string, e.g. "1:15"
  horiz_break:    ['Horizontal Break (in)', 'HorzBreak', 'Horizontal Break', 'pfxX', 'HorzMovement'],
  vert_break:     ['Induced Vertical Break (in)', 'InducedVertBreak', 'Induced Vert Break', 'pfxZ', 'InducedVertMovement'],
  extension:      ['Extension (ft)', 'Extension', 'ReleaseExtension'],
  vaa:            ['Vert. Appr. Angle', 'VertApprAngle', 'VAA', 'VerticalApproachAngle'],
  release_height: ['Release Height (ft)', 'ReleaseHeight', 'RelHeight'],
}

export type CsvParse =
  | { ok: true; records: string[][]; lines: number[]; strayQuoteLines: number[] }   // lines[k] = line record k starts on
  | { ok: false; error: string }

/**
 * Split CSV text into records of fields. A quote is special only at the start
 * of a field (so 6'2" stays as text). Fails only on an unclosed quote.
 */
export function parseCsv(text: string): CsvParse {
  const records: string[][] = []
  const lines: number[] = []
  let record: string[] = []
  let field = ''
  let fieldStarted = false
  let inQuotes = false
  let quoteLine = 0
  let line = 1
  let recordLine = 1
  let afterClosingQuote = false
  const strayQuoteLines: number[] = []
  const stray = () => { if (strayQuoteLines[strayQuoteLines.length - 1] !== line) strayQuoteLines.push(line) }
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const n = text.length
  const endField = () => { record.push(field); field = ''; fieldStarted = false; afterClosingQuote = false }
  const endRecord = () => { endField(); records.push(record); lines.push(recordLine); record = [] }
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; afterClosingQuote = true; i++; continue
      }
      if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++
      field += c; i++; continue
    }
    if (c === '"' && !fieldStarted) { inQuotes = true; fieldStarted = true; quoteLine = line; i++; continue }
    if (c === ',') { endField(); i++; continue }
    if (c === '\r' || c === '\n') {
      endRecord()
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      line++
      recordLine = line
      continue
    }
    if (c === '"' || afterClosingQuote) stray()
    field += c; fieldStarted = true; i++
  }
  if (inQuotes) return { ok: false, error: `a quoted value that starts on line ${quoteLine} is never closed.` }
  if (fieldStarted || record.length > 0) endRecord()
  return { ok: true, records, lines, strayQuoteLines }
}

/** Empty-looking cells exports use for "no value". */
const MISSING = new Set(['', '-', '—', 'na', 'n/a', 'nan', 'null'])

type NumberCell = { ok: true; value: number | null } | { ok: false }
/** A whole-cell number ("86.8", "-7.2", "0"); blank/missing markers -> null. */
function readNumber(raw: string | null): NumberCell {
  const s = (raw ?? '').trim()
  if (MISSING.has(s.toLowerCase())) return { ok: true, value: null }
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { ok: false }
  return { ok: true, value: Number(s) }
}

export type PitchFields = {
  pitch_type: string | null
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  horizontal_break: number | null
  vertical_break: number | null
  extension: number | null
  vaa: number | null
  release_height: number | null
}

/** Map one CSV row to pitch fields; `problems` lists values that couldn't be read. */
export function mapPitchRow(row: Record<string, string>): { fields: PitchFields; problems: string[] } {
  const found = (aliases: string[]): { header: string; value: string } | null => {
    for (const a of aliases) {
      if (row[a] !== undefined && row[a].trim() !== '') return { header: a, value: row[a].trim() }
    }
    return null
  }
  const problems: string[] = []
  const num = (aliases: string[], integer = false): number | null => {
    const cell = found(aliases)
    if (!cell) return null
    const r = readNumber(cell.value)
    if (!r.ok) { problems.push(`${cell.header} "${cell.value}" isn't a number`); return null }
    return r.value == null ? null : integer ? Math.trunc(r.value) : r.value
  }
  const pitchType = found(COLUMN_MAP.pitch_type)
  const fields: PitchFields = {
    pitch_type:       pitchType && !MISSING.has(pitchType.value.toLowerCase()) ? pitchType.value : null,
    velocity:         num(COLUMN_MAP.velocity),
    spin_rate:        num(COLUMN_MAP.spin_rate, true),
    spin_axis:        null,
    horizontal_break: num(COLUMN_MAP.horiz_break),
    vertical_break:   num(COLUMN_MAP.vert_break),
    extension:        num(COLUMN_MAP.extension),
    vaa:              num(COLUMN_MAP.vaa),
    release_height:   num(COLUMN_MAP.release_height),
  }
  // Degrees are TrackMan convention (180° = 12:00) and converted; clock strings are used as-is.
  const axis = found(COLUMN_MAP.spin_axis)
  const tilt = found(COLUMN_MAP.tilt)
  const usable = (c: { value: string } | null) => c && !MISSING.has(c.value.toLowerCase()) ? c : null
  fields.spin_axis = parseImportedSpinAxis(usable(axis)?.value) ?? parseImportedSpinAxis(usable(tilt)?.value)
  if (fields.spin_axis == null && (usable(axis) || usable(tilt))) {
    const c = (usable(axis) ?? usable(tilt))!
    problems.push(`${axis && usable(axis) ? axis.header : tilt!.header} "${c.value}" isn't a spin axis`)
  }
  return { fields, problems }
}

export type CsvPitchRow = PitchFields & { _raw: Record<string, string> }
export type SkippedRow = { line: number; reason: string }
export type PitchCsvResult =
  | { ok: true; rows: CsvPitchRow[]; skipped: SkippedRow[]; warnings: string[] }
  | { ok: false; error: string }

/** Parse a pitch CSV file's text into rows to save plus the rows that were skipped. */
export function readPitchCsv(text: string): PitchCsvResult {
  const parsed = parseCsv(text)
  if (!parsed.ok) return { ok: false, error: `Couldn't read this CSV: ${parsed.error}` }
  const isBlank = (r: string[]) => r.every(v => v.trim() === '')
  const lines = parsed.lines
  const firstIdx = parsed.records.findIndex(r => !isBlank(r))
  if (firstIdx < 0) return { ok: false, error: 'This CSV is empty.' }
  const headers = parsed.records[firstIdx].map(h => h.trim())
  if (headers.length > 1 && headers[headers.length - 1] === '') headers.pop()   // header line with a trailing comma
  const rows: CsvPitchRow[] = []
  const skipped: SkippedRow[] = []
  for (let k = firstIdx + 1; k < parsed.records.length; k++) {
    const values = parsed.records[k]
    if (isBlank(values)) continue
    // A trailing comma (one extra, empty last value) is common in exports; ignore it.
    if (values.length === headers.length + 1 && values[values.length - 1].trim() === '') values.pop()
    const line = lines[k]
    if (values.length !== headers.length) {
      skipped.push({ line, reason: `has ${values.length} columns, the header has ${headers.length}` })
      continue
    }
    const raw = Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]))
    const { fields, problems } = mapPitchRow(raw)
    if (problems.length > 0) { skipped.push({ line, reason: problems.join('; ') }); continue }
    if (fields.pitch_type === null && fields.velocity === null) {
      skipped.push({ line, reason: 'no pitch type or velocity' })
      continue
    }
    rows.push({ ...fields, _raw: raw })
  }
  const warnings = parsed.strayQuoteLines.map(l => `line ${l} has a stray quote (") that was kept as text; check that row's values`)
  return { ok: true, rows, skipped, warnings }
}

/** One line for the page: how many rows were skipped and why (first few). */
export function warningsSummary(warnings: string[], max = 3): string | null {
  if (warnings.length === 0) return null
  const more = warnings.length > max ? `; and ${warnings.length - max} more` : ''
  return `Check ${warnings.length === 1 ? 'this row' : 'these rows'}: ${warnings.slice(0, max).join('; ')}${more}.`
}

export function skippedSummary(skipped: SkippedRow[], max = 3): string | null {
  if (skipped.length === 0) return null
  const head = skipped.slice(0, max).map(s => `line ${s.line}: ${s.reason}`).join('; ')
  const more = skipped.length > max ? `; and ${skipped.length - max} more` : ''
  return `${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped and won't be saved (${head}${more}).`
}
