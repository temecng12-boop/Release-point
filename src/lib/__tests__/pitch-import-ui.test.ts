/**
 * Pitch import after migration 035: the CSV and TrackMan PDF imports go through
 * the importPitchMetrics server action (no browser insert, which RLS refuses
 * for players and team coaches after 035), the table changes only after the
 * server confirmed, and entry/import is shown only to the direct coach or the
 * player (team coaches are read-only under 031).
 * Run with: npx tsx --test src/lib/__tests__/pitch-import-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canAddPitchData, type ClipAccess } from '../clip-access'
import { readPitchCsv } from '../pitch-csv'
import { csvImportFrom, validatePitchImport, pitchAxisError } from '../pitch-import'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const between = (src: string, a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)))

test('canAddPitchData: direct coach and the player only', () => {
  const a = (via: 'player' | 'coach' | 'guardian' | 'team_coach'): ClipAccess => ({ allowed: true, via, teamCheck: 'ok' })
  assert.equal(canAddPitchData(a('coach')), true)
  assert.equal(canAddPitchData(a('player')), true)
  assert.equal(canAddPitchData(a('team_coach')), false)
  assert.equal(canAddPitchData(a('guardian')), false)
  assert.equal(canAddPitchData({ allowed: false, teamCheck: 'ok' }), false)
})

test('metrics tab: no browser Supabase writes; both imports call importPitchMetrics and update only on success', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  assert.doesNotMatch(src, /@\/lib\/supabase\/client/)
  assert.doesNotMatch(src, /\.from\('pitch_metrics'\)/)
  for (const [a, b, setErr] of [['async function handleSave', '// ── Handle PDF selection', 'setSaveError'], ['async function handlePdfSave', 'return (', 'setPdfError']]) {
    const fn = between(src, a, b)
    const call = fn.indexOf('runAction(() => importPitchMetrics(clipId,')
    const bail = fn.indexOf(`if (!result.ok) { ${setErr}(result.error); return }`)
    const show = fn.indexOf('updateMetrics(')
    assert.ok(call > 0 && bail > call && show > bail, fn)
  }
  assert.match(src, /saveError && <p role="alert"/)
  assert.match(src, /pdfError {2}&& <p role="alert"/)
})

test('metrics tab: import and manual entry only when canAdd; 44px touch targets', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  assert.match(src, /\{canAdd && \(\n\s*<div[^>]*>\n\s*<div>\n\s*<p[^>]*>Import Pitch Analytics/)
  assert.match(src, /\{canAdd && \(\n\s*<div[^>]*>\n\s*<div className="flex items-center justify-between mb-3">/)
  for (const b of ['onClick={() => fileRef.current?.click()}', 'onClick={() => pdfRef.current?.click()}', 'onClick={handleSave}', 'onClick={handlePdfSave}', 'onClick={handleManualSave}']) {
    const tag = between(src, b, '>')
    assert.match(src.slice(src.indexOf(b), src.indexOf(b) + 400), /max-sm:min-h-11/, b + tag)
  }
  const page = read('app/clips/[id]/page.tsx')
  assert.match(page, /canAddMetrics=\{canAddPitchData\(access\)\}/)
  assert.match(read('app/clips/[id]/clip-tabs.tsx'), /canAdd=\{canAddMetrics\}/)
})

test('server validation accepts exactly the rows the CSV preview accepted', () => {
  const r = readPitchCsv('Pitch Type,Velocity,Tilt,Rel Height\nFastball,90,1:15,5.9\nSlider,80.5,,5.8\n')
  assert.ok(r.ok)
  const v = validatePitchImport(csvImportFrom(r.rows))
  assert.ok(v.ok)
  assert.deepEqual(v.rows.map(({ raw_data: _r, ...f }) => { void _r; return f }), r.rows.map(({ _raw, release_height: _h, ...f }) => { void _raw; void _h; return f }))
  assert.equal(pitchAxisError(359.5), null); assert.match(pitchAxisError(360) ?? '', /clock time/); assert.match(pitchAxisError(-1) ?? '', /clock time/)
})
