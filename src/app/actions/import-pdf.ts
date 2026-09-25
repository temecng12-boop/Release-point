'use server'

export interface ParsedPitchRow {
  pitch_type: string
  velocity: number | null
  max_velocity: number | null
  spin_rate: number | null
  max_spin_rate: number | null
  vertical_break: number | null   // IVB
  horizontal_break: number | null // HB
  spin_axis: number | null        // converted from tilt (degrees)
  extension: number | null
}

const PITCH_TYPES = [
  'Fastball', 'Curveball', 'ChangeUp', 'Slider',
  'Cutter', 'Sinker', 'Splitter', 'Two-Seam', 'Sweeper',
]

function tiltToDegrees(tilt: string): number | null {
  const match = tilt.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const h = parseInt(match[1]) % 12
  const m = parseInt(match[2])
  return Math.round((h * 30 + m * 0.5)) % 360
}

function parseTrackmanText(text: string): ParsedPitchRow[] {
  // Collapse whitespace into single spaces for regex scanning
  const flat = text.replace(/\s+/g, ' ')

  const rows: Record<string, ParsedPitchRow> = {}

  for (const pt of PITCH_TYPES) {
    const esc = pt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Velocity table: PitchType count avgVelo maxVelo avgSpin maxSpin ext
    // Spin rates are 3-4 digit integers; velocity is 2-3 digits with one decimal
    const veloRe = new RegExp(
      `${esc}\\s+(\\d{1,3})\\s+(\\d{2,3}\\.\\d)\\s+(\\d{2,3}\\.\\d)\\s+(\\d{3,4})\\s+(\\d{3,4})\\s+(\\d\\.\\d)`,
      'i'
    )
    const vm = flat.match(veloRe)
    if (vm) {
      if (!rows[pt]) rows[pt] = emptyRow(pt)
      rows[pt].velocity     = parseFloat(vm[2])
      rows[pt].max_velocity = parseFloat(vm[3])
      rows[pt].spin_rate    = parseInt(vm[4])
      rows[pt].max_spin_rate = parseInt(vm[5])
      rows[pt].extension    = parseFloat(vm[6])
    }

    // Movement table: PitchType count IVB HB tilt
    // IVB and HB are signed decimals; tilt is h:mm
    const movRe = new RegExp(
      `${esc}\\s+\\d{1,3}\\s+(-?\\d{1,2}\\.\\d)\\s+(-?\\d{1,2}\\.\\d)\\s+(\\d{1,2}:\\d{2})`,
      'i'
    )
    const mm = flat.match(movRe)
    if (mm) {
      if (!rows[pt]) rows[pt] = emptyRow(pt)
      rows[pt].vertical_break   = parseFloat(mm[1])
      rows[pt].horizontal_break = parseFloat(mm[2])
      rows[pt].spin_axis        = tiltToDegrees(mm[3])
    }
  }

  return Object.values(rows).filter(r => r.velocity != null || r.spin_rate != null)
}

function emptyRow(pitch_type: string): ParsedPitchRow {
  return {
    pitch_type,
    velocity: null, max_velocity: null,
    spin_rate: null, max_spin_rate: null,
    vertical_break: null, horizontal_break: null,
    spin_axis: null, extension: null,
  }
}

export async function parseTrackmanPDF(formData: FormData): Promise<{ pitches: ParsedPitchRow[]; error?: string }> {
  const file = formData.get('file') as File | null
  if (!file) return { pitches: [], error: 'No file provided.' }
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    return { pitches: [], error: 'Please upload a PDF file.' }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const buffer = Buffer.from(await file.arrayBuffer())
    const { text } = await pdfParse(buffer)
    const pitches = parseTrackmanText(text)
    if (pitches.length === 0) {
      return { pitches: [], error: 'No pitch data found in this PDF. Make sure it\'s a TrackMan player report.' }
    }
    return { pitches }
  } catch {
    return { pitches: [], error: 'Could not read the PDF. Try re-exporting from TrackMan.' }
  }
}
