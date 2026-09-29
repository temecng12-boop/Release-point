/**
 * Tests for roster authorization rules (RP-041).
 * Run with: npx tsx src/lib/__tests__/roster-access.test.ts
 * Pure functions only; no database or network.
 */

import {
  isPlayersOwnCoach,
  teamIdsNotOwned,
  pickCoachEditableFields,
  profilePageAccess,
  splitRosterByCoach,
} from '../auth/roster-access'

let passed = 0
let failed = 0
function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) { console.log(`  ✓  ${label}`); passed++ }
  else { console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ''}`); failed++ }
}
function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
}

const COACH = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER = 'aaaaaaaa-0000-4000-8000-000000000002'

section('isPlayersOwnCoach (updatePlayer gate)')
assert(isPlayersOwnCoach(COACH, { coach_id: COACH }), 'own coach: allowed')
assert(!isPlayersOwnCoach(OTHER, { coach_id: COACH }), 'another coach: refused')
assert(!isPlayersOwnCoach(COACH, { coach_id: null }), 'coach-less player: refused for every coach')
assert(!isPlayersOwnCoach(COACH, null), 'unknown player: refused')
assert(!isPlayersOwnCoach('', { coach_id: '' as unknown as string }), 'empty ids never match')
assert(!isPlayersOwnCoach(null, { coach_id: COACH }), 'no user: refused')

section('teamIdsNotOwned')
assert(teamIdsNotOwned(['t1', 't2'], ['t1', 't2', 't3']).length === 0, 'all owned: none rejected')
assert(JSON.stringify(teamIdsNotOwned(['t1', 'x9'], ['t1'])) === '["x9"]', "another coach's team is rejected")
assert(teamIdsNotOwned([], []).length === 0, 'empty request: nothing rejected')
assert(teamIdsNotOwned(['t1'], []).length === 1, 'coach with no teams: any team rejected')

section('pickCoachEditableFields')
const picked = pickCoachEditableFields({
  full_name: 'a b', age_group: 'Youth', position: 'pitcher',
  coach_id: OTHER, user_id: OTHER, consent_given_at: '2026-01-01', adult_confirmed_at: '2026-01-01', email: 'x@y',
})
assert(JSON.stringify(Object.keys(picked).sort()) === '["age_group","full_name","position"]', 'keeps only name, age group, position', JSON.stringify(picked))
assert(Object.keys(pickCoachEditableFields({ full_name: 5, position: null })).length === 0, 'drops non-string values')

section('profilePageAccess (/profile/[id])')
assert(profilePageAccess(COACH, 'coach', { coach_id: COACH }) === 'view', 'own coach: view')
assert(profilePageAccess(OTHER, 'coach', { coach_id: COACH }) === 'not-found', 'another coach: 404')
assert(profilePageAccess(COACH, 'coach', { coach_id: null }) === 'not-found', 'coach-less player: 404 for every coach')
assert(profilePageAccess(COACH, 'coach', null) === 'not-found', 'unknown player: 404')
assert(profilePageAccess(COACH, 'player', { coach_id: COACH }) === 'redirect-dashboard', 'player role: sent to own dashboard')
assert(profilePageAccess(COACH, 'guardian', { coach_id: COACH }) === 'redirect-dashboard', 'guardian role: sent to dashboard (which redirects to /guardian)')
assert(profilePageAccess(COACH, undefined, { coach_id: COACH }) === 'redirect-dashboard', 'no profile: sent to dashboard')

section('splitRosterByCoach (team page roster)')
{
  const rows = [
    { id: 'p1', coach_id: COACH },
    { id: 'p2', coach_id: OTHER },
    { id: 'p3', coach_id: null },
    { id: 'p4', coach_id: COACH },
  ]
  const { own, others } = splitRosterByCoach(COACH, rows)
  assert(JSON.stringify(own.map((r) => r.id)) === '["p1","p4"]', 'own players: only coach_id = caller')
  assert(JSON.stringify(others.map((r) => r.id)) === '["p2","p3"]', "other coaches' and coach-less players are split out")
  assert(splitRosterByCoach(COACH, []).own.length === 0, 'empty roster')
}

section('Results')
const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
