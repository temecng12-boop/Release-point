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
  isThePlayer,
  splitRosterByCoach,
  canDeleteClip,
  canDeleteClipItem,
  canUseAiCoachFor,
  pickBullpenUpdates,
  ownTeamIdsByPlayer,
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

const PLAYER_USER = 'cccccccc-0000-4000-8000-000000000001'
const FORMER_COACH = 'aaaaaaaa-0000-4000-8000-000000000003'
const owned = { coach_id: COACH, user_id: PLAYER_USER }
const coachless = { coach_id: null, user_id: PLAYER_USER }

section('isThePlayer')
assert(isThePlayer(PLAYER_USER, owned), 'player account matches')
assert(!isThePlayer(COACH, owned), 'coach is not the player')
assert(!isThePlayer(PLAYER_USER, { coach_id: COACH, user_id: null }), 'unclaimed player row: no one')

section('canDeleteClip (deleteClip)')
assert(canDeleteClip(COACH, FORMER_COACH, owned), 'current coach: allowed, whoever uploaded')
assert(canDeleteClip(COACH, null, owned), 'current coach: allowed with no uploader recorded')
assert(!canDeleteClip(FORMER_COACH, FORMER_COACH, owned), 'former coach who uploaded it: refused')
assert(!canDeleteClip(OTHER, OTHER, coachless), 'coach who uploaded for a now coach-less player: refused')
assert(canDeleteClip(PLAYER_USER, PLAYER_USER, owned), 'player deleting a clip they uploaded: allowed')
assert(canDeleteClip(PLAYER_USER, PLAYER_USER, coachless), 'coach-less player deleting own upload: allowed')
assert(!canDeleteClip(PLAYER_USER, COACH, owned), "player deleting the coach's upload: refused")
assert(!canDeleteClip(COACH, COACH, null), 'unknown player: refused')
// Uploader deleted (uploaded_by is NULL, migration 022): NULL never matches a user.
assert(!canDeleteClip(PLAYER_USER, null, owned), 'no uploader recorded: the player may not delete it')
assert(!canDeleteClip(PLAYER_USER, undefined, coachless), 'no uploader recorded, coach-less player: refused')
assert(!canDeleteClip('', null, { coach_id: null, user_id: null }), 'empty user id vs all-NULL row: refused')

section('canDeleteClipItem (deleteTimestampNote, deleteAnnotation)')
assert(canDeleteClipItem(COACH, COACH, owned), 'current coach deleting their own note: allowed')
assert(!canDeleteClipItem(COACH, PLAYER_USER, owned), "current coach deleting the player's note: refused (unchanged)")
assert(!canDeleteClipItem(FORMER_COACH, FORMER_COACH, owned), 'former coach deleting their old note: refused')
assert(canDeleteClipItem(PLAYER_USER, PLAYER_USER, owned), 'player deleting their own note: allowed')
assert(!canDeleteClipItem(PLAYER_USER, COACH, owned), "player deleting the coach's note: refused")
assert(!canDeleteClipItem(COACH, null, owned), 'note with no author: refused')
assert(!canDeleteClipItem(COACH, COACH, null), 'unknown player: refused')
assert(!canDeleteClipItem(PLAYER_USER, null, owned), 'item with no author: the player may not delete it')
assert(!canDeleteClipItem('', null, { coach_id: null, user_id: null }), 'empty user id vs all-NULL row: refused')

section('canUseAiCoachFor (api/ai-chat)')
assert(canUseAiCoachFor(COACH, owned), 'own coach: allowed')
assert(canUseAiCoachFor(PLAYER_USER, owned), 'the player: allowed')
assert(!canUseAiCoachFor(OTHER, owned), 'another coach: refused')
assert(!canUseAiCoachFor(COACH, coachless), 'any coach for a coach-less player: refused')
assert(!canUseAiCoachFor(COACH, null), 'unknown player: refused')

section('pickBullpenUpdates (updateBullpenSession)')
{
  const picked = pickBullpenUpdates({
    pitches: [{ pitch_type: 'FB', target: 10, thrown: 4, focus: 'command', extra: 'x' }],
    notes: 'ok', status: 'complete',
    player_id: 'evil', coach_id: OTHER, id: 'x', created_at: '2020-01-01', session_date: '2020-01-01',
  })
  assert(picked !== null && JSON.stringify(Object.keys(picked).sort()) === '["notes","pitches","status"]', 'player_id, coach_id and other keys are dropped', JSON.stringify(picked))
  assert(JSON.stringify(picked?.pitches) === '[{"pitch_type":"FB","target":10,"thrown":4,"focus":"command"}]', 'pitch blocks keep only known fields')
  assert(JSON.stringify(pickBullpenUpdates({ player_id: 'evil', coach_id: OTHER })) === '{}', 'only forbidden keys: nothing to update')
  assert(pickBullpenUpdates({ status: 'deleted' }) === null, 'unknown status: rejected')
  assert(pickBullpenUpdates({ pitches: 'x' }) === null, 'pitches must be an array')
  assert(pickBullpenUpdates({ pitches: [{ target: 1 }] }) === null, 'pitch block without a pitch type: rejected')
  assert(pickBullpenUpdates({ notes: 5 }) === null, 'notes must be a string')
  assert(pickBullpenUpdates(null) === null, 'no updates object: rejected')
  const noThrown = pickBullpenUpdates({ pitches: [{ pitch_type: 'SL', target: 5 }] })
  assert(noThrown?.pitches?.[0].thrown === 0 && noThrown.pitches[0].focus === '', 'missing thrown/focus default to 0 and empty')
}

section('ownTeamIdsByPlayer (team page edit form)')
{
  const links = [
    { player_id: 'p1', team_id: 't1' },
    { player_id: 'p1', team_id: 't2' },
    { player_id: 'p1', team_id: 'x9' },
    { player_id: 'p2', team_id: 't2' },
    { player_id: 'p2', team_id: 't2' },
  ]
  const m = ownTeamIdsByPlayer(links, ['t1', 't2'])
  assert(JSON.stringify(m.p1) === '["t1","t2"]', "a player on two of the coach's teams gets both (not just the team being viewed)")
  assert(!m.p1.includes('x9'), "another coach's team is left out")
  assert(JSON.stringify(m.p2) === '["t2"]', 'duplicate links collapse')
  assert(m.p3 === undefined, 'player with no own-team links: absent')
  assert(Object.keys(ownTeamIdsByPlayer(links, [])).length === 0, 'coach with no teams: nothing')
}

const total = passed + failed
console.log(`\n  ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`)
if (failed > 0) process.exit(1)
