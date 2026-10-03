/**
 * QA-014: pitch CSV import with quoted fields. Fixtures are the QA suite's
 * synthetic TrackMan files (fixtures/csv, copied from releasepoint-qa).
 * Run with: npx tsx --test src/lib/__tests__/pitch-csv.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, readPitchCsv, skippedSummary, warningsSummary, mapPitchRow } from '../pitch-csv'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/csv/${name}`, import.meta.url), 'utf8')
const fields = (r: Record<string, unknown>) => { const { _raw, ...f } = r; void _raw; return f }

test('TrackMan file with "Testman, Quinn" (quoted comma) imports every column correctly', () => {
  const r = readPitchCsv(fixture('trackman_synthetic.csv'))
  assert.ok(r.ok)
  assert.deepEqual(r.skipped, [])
  assert.equal(r.rows.length, 12)
  const first = r.rows[0]
  assert.equal(first._raw.Pitcher, 'Testman, Quinn')
  assert.equal(first._raw.PitcherTeam, 'QA_SYNTH')
  assert.equal(first.pitch_type, 'Fastball')
  assert.equal(first.velocity, 86.8)
  assert.equal(first.spin_rate, 2253)
  assert.equal(first.vertical_break, 16.4)
  assert.equal(first.horizontal_break, -7.2)
  assert.equal(first.extension, 6.2)
  assert.equal(first.vaa, -5.96)
  assert.equal(first.release_height, 5.72)
  assert.ok(first.spin_axis != null)
  assert.deepEqual(r.rows.map(x => x.pitch_type).slice(0, 4), ['Fastball', 'Slider', 'Curveball', 'ChangeUp'])
})

test('the quoted file gives the same pitch data as the no-comma control file', () => {
  const quoted = readPitchCsv(fixture('trackman_synthetic.csv'))
  const control = readPitchCsv(fixture('trackman_noquote_control.csv'))
  assert.ok(quoted.ok && control.ok)
  assert.deepEqual(control.skipped, [])
  assert.deepEqual(quoted.rows.map(fields), control.rows.map(fields))
})

test('CRLF line endings and a BOM give the same result', () => {
  const text = fixture('trackman_synthetic.csv')
  const crlf = readPitchCsv('\uFEFF' + text.replace(/\n/g, '\r\n'))
  const plain = readPitchCsv(text)
  assert.ok(crlf.ok && plain.ok)
  assert.deepEqual(crlf.rows, plain.rows)
  assert.equal(Object.keys(crlf.rows[0]._raw)[0], 'PitchNo')
})

test('parseCsv: escaped quotes, line breaks inside quotes, CR/CRLF/LF, inch marks', () => {
  const r = parseCsv('a,b,c\r\n"say ""hi""","line1\nline2",6\'2"\r"x, y",,""\n')
  assert.ok(r.ok)
  assert.deepEqual(r.records, [['a', 'b', 'c'], ['say "hi"', 'line1\nline2', '6\'2"'], ['x, y', '', '']])
  assert.deepEqual(r.lines, [1, 2, 4])
  const noTrailing = parseCsv('a,b\n1,2')
  assert.ok(noTrailing.ok)
  assert.deepEqual(noTrailing.records, [['a', 'b'], ['1', '2']])
})

test('QA malformed file (unclosed quote) is an error, not a silent import', () => {
  const r = readPitchCsv(fixture('malformed.csv'))
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /Couldn't read this CSV: a quoted value that starts on line 2 is never closed/)
})

test('a row with the wrong column count is skipped and reported, the rest still import', () => {
  const header = 'Pitcher,TaggedPitchType,RelSpeed,SpinRate'
  // Row 3 is what a naive export with an unquoted comma looks like.
  const r = readPitchCsv(`${header}\n"Testman, Quinn",Fastball,86.8,2253\nTestman, Quinn,Slider,76.4,2466\n"Q",Curveball,71.5,2527\n`)
  assert.ok(r.ok)
  assert.deepEqual(r.rows.map(x => x.pitch_type), ['Fastball', 'Curveball'])
  assert.deepEqual(r.skipped, [{ line: 3, reason: 'has 5 columns, the header has 4' }])
  assert.equal(skippedSummary(r.skipped), "1 row skipped and won't be saved (line 3: has 5 columns, the header has 4).")
})

test('a number that cannot be read skips the row with a reason (never a quiet blank)', () => {
  const r = readPitchCsv('TaggedPitchType,RelSpeed,SpinRate,HorzBreak\nFastball,ninety,2253,0\nSlider,76.4,-,0\nCurve,71.5abc,2500,1\n')
  assert.ok(r.ok)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].pitch_type, 'Slider')
  assert.equal(r.rows[0].spin_rate, null)          // "-" is an explicit "no value"
  assert.equal(r.rows[0].horizontal_break, 0)      // 0 stays 0
  assert.deepEqual(r.skipped, [
    { line: 2, reason: 'RelSpeed "ninety" isn\'t a number' },
    { line: 4, reason: 'RelSpeed "71.5abc" isn\'t a number' },
  ])
  assert.deepEqual(mapPitchRow({ SpinAxis: 'abc', TaggedPitchType: 'FB' }).problems, ['SpinAxis "abc" isn\'t a spin axis'])
  assert.deepEqual(mapPitchRow({ SpinAxis: '', Tilt: '1:15', TaggedPitchType: 'FB' }).problems, [])
})

test('unrecognised headers: nothing to save, and every row is reported as skipped', () => {
  const r = readPitchCsv(fixture('generic_synthetic.csv'))
  assert.ok(r.ok)
  assert.equal(r.rows.length, 0)
  assert.equal(r.skipped.length, 6)
  assert.match(String(skippedSummary(r.skipped)), /^6 rows skipped and won't be saved \(line 2: no pitch type or velocity; .*; and 3 more\)\.$/)
})

test('works the same in WebKit: plain string code, FileReader text, .csv and text/csv accepted', () => {
  const lib = readFileSync(new URL('../pitch-csv.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(lib, /\(\?<[=!]|Buffer|require\(|TextDecoder|node:/)
  const tab = readFileSync(new URL('../../app/clips/[id]/metrics-tab.tsx', import.meta.url), 'utf8')
  assert.match(tab, /accept="\.csv,text\/csv"/)
  assert.match(tab, /reader\.readAsText\(file\)/)
  assert.match(tab, /reader\.onerror = /)
  assert.doesNotMatch(tab, /split\(','\)/)
})

test('re-picking the same CSV imports it again: the picker is cleared once the file is read', () => {
  const tab = readFileSync(new URL('../../app/clips/[id]/metrics-tab.tsx', import.meta.url), 'utf8')
  const handler = tab.slice(tab.indexOf('function handleFile('), tab.indexOf('// ── Save parsed rows'))
  assert.match(handler, /const input = e\.target/)
  assert.match(handler, /reader\.onloadend = \(\) => \{ input\.value = '' \}/)
  // Cleared after the read starts being handled, for success and error alike.
  assert.ok(handler.indexOf('reader.onloadend') < handler.indexOf('reader.readAsText(file)'))
})

test('a trailing comma on rows (and on the header) is ignored, not a column-count error', () => {
  const rowsOnly = readPitchCsv('Pitch Type,Velocity\nFastball,92.1,\nSlider,84,\n')
  assert.ok(rowsOnly.ok)
  assert.deepEqual(rowsOnly.rows.map(r => [r.pitch_type, r.velocity]), [['Fastball', 92.1], ['Slider', 84]])
  assert.deepEqual(rowsOnly.skipped, [])
  const both = readPitchCsv('Pitch Type,Velocity,\nFastball,92.1,\nSlider,84\n')
  assert.ok(both.ok)
  assert.deepEqual(both.rows.map(r => r.velocity), [92.1, 84])
  assert.deepEqual(both.skipped, [])
  // A real extra value is still reported.
  const extra = readPitchCsv('Pitch Type,Velocity\nFastball,92.1,x\n')
  assert.ok(extra.ok)
  assert.equal(extra.rows.length, 0)
  assert.equal(extra.skipped[0].line, 2)
})

test('a stray quote is kept as text but warned about with its line number', () => {
  const r = readPitchCsv('Pitch Type,Velocity\nFastball,92\nCut"ter,88\n"Slider"x,84\n')
  assert.ok(r.ok)
  assert.equal(r.rows.length, 3)
  assert.equal(r.rows[1].pitch_type, 'Cut"ter')
  assert.equal(r.warnings.length, 2)
  assert.match(r.warnings[0], /^line 3 has a stray quote/)
  assert.match(r.warnings[1], /^line 4 has a stray quote/)
  assert.match(warningsSummary(r.warnings)!, /line 3.*line 4/)
  const clean = readPitchCsv('Pitch Type,Velocity\n"Fastball, 4-seam",92\n"say ""hi""",90\n')
  assert.ok(clean.ok)
  assert.deepEqual(clean.warnings, [])
  assert.equal(warningsSummary([]), null)
})

test('the page shows stray-quote warnings and clears the skipped-rows note after a successful save', () => {
  const tab = readFileSync(new URL('../../app/clips/[id]/metrics-tab.tsx', import.meta.url), 'utf8')
  assert.match(tab, /warningsSummary\(result\.warnings\)/)
  const save = tab.slice(tab.indexOf('async function handleSave'), tab.indexOf('function handlePdfFile'))
  // Cleared only on the success path, after the server confirmed the import.
  const ok = save.slice(save.indexOf('updateMetrics(prev => [...prev, ...saved])'))
  assert.ok(save.indexOf('if (!result.ok)') < save.indexOf('updateMetrics(prev => [...prev, ...saved])'))
  assert.match(ok, /setCsvSkipped\(null\)/)
})
