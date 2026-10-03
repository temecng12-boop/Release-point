'use server'

import { parseClockAxis } from '@/lib/spin-axis'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pitchMetricWriteAccess } from '@/lib/pitch-access'
import { pdfFileProblem } from '@/lib/pitch-import'

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

// TrackMan PDF "Tilt" is a clock string, already in the app convention (12:00 = 0°).
// Kept unrounded (1:15 = 37.5°) so it displays back as 1:15; the save path
// rounds only if the column is still integer (before migration 020).
function tiltToDegrees(tilt: string): number | null {
  const match = tilt.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const parsed = parseClockAxis(`${match[1]}:${match[2]}`)
  return parsed.ok ? parsed.degrees : null
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

/**
 * Read a TrackMan PDF into pitch rows for the preview (nothing is saved here).
 * Signed-in users only. With a clipId: the same rule as saving pitch data
 * (the player's direct coach or the player). Without one: a coach or player
 * profile. The file must be a PDF (type and %PDF- header) of at most
 * PDF_MAX_BYTES, the same cap the browser checks before sending.
 */
export async function parseTrackmanPDF(formData: FormData): Promise<{ pitches: ParsedPitchRow[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { pitches: [], error: 'Please sign in again to import a PDF.' }

  const clipId = formData.get('clipId')
  if (typeof clipId === 'string' && clipId) {
    const access = await pitchMetricWriteAccess(user.id, clipId)
    if (access === 'error') return { pitches: [], error: 'Couldn\'t check access to this clip. Please try again.' }
    if (access === 'no-clip') return { pitches: [], error: 'This clip no longer exists.' }
    if (access === 'denied') return { pitches: [], error: 'Only the player\'s coach or the player can import pitch data for this clip.' }
  } else {
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError) {
      console.error('[parseTrackmanPDF] profile lookup failed', user.id, profileError.code, profileError.message)
      return { pitches: [], error: 'Couldn\'t check your account. Please try again.' }
    }
    const role = (profile as { role?: string } | null)?.role
    if (role !== 'coach' && role !== 'player') return { pitches: [], error: 'Only coaches and players can import pitch data.' }
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') return { pitches: [], error: 'No file provided.' }
  const problem = pdfFileProblem(file)
  if (problem) return { pitches: [], error: problem }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return { pitches: [], error: 'Please upload a PDF file.' }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const { text } = await pdfParse(buffer)
    const pitches = parseTrackmanText(text)
    if (pitches.length === 0) {
      return { pitches: [], error: 'No pitch data found in this PDF. Make sure it\'s a TrackMan player report.' }
    }
    return { pitches }
  } catch (e) {
    console.error('[parseTrackmanPDF] could not read the PDF', e)
    return { pitches: [], error: 'Could not read the PDF. Try re-exporting from TrackMan.' }
  }
}
