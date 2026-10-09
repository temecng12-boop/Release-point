/**
 * Migration 045 (rate_limit_log + waitlist extras + clip columns):
 *   - applies cleanly, including twice (idempotent);
 *   - the prod paste is byte-identical to the migration.
 * Run with: npx tsx --test supabase/tests/rate-limit-045.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, tryFile, migration } from './prod-shape/prod-fixture'

const AFTER_044 = [
  '037_age_bands.sql',
  '038_grandfather_existing_players.sql',
  '039_terms_history_tos_lock_grade_ranges.sql',
  '040_profile_freeze_marker.sql',
  '041_coach_invites.sql',
  '042_invite_only_signup_hook.sql',
  '043_under_13_launch_policy.sql',
  '044_player_positions_clip_kind.sql',
]
const M045 = migration('045_rate_limit_waitlist_clip_extras.sql')
const PASTE = join(__dirname, '..', '..', 'prod-sql-045-rate-limit-waitlist-clip-extras.sql')

async function dbThrough044(): Promise<PGlite> {
  const { db, unexpected } = await freshDb('037')
  assert.deepEqual(unexpected, [])
  for (const m of AFTER_044) {
    assert.equal(await tryFile(db, migration(m)), '', m)
    assert.equal(await tryFile(db, migration(m)), '', `${m} runs twice`)
  }
  return db
}

test('045 applies twice and the prod paste is byte-identical', async () => {
  const db = await dbThrough044()
  assert.equal(await tryFile(db, M045), '', '045 first apply')
  assert.equal(await tryFile(db, M045), '', '045 second apply (idempotent)')

  const tables = (await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limit_log'`,
  )).rows
  assert.equal(tables.length, 1)

  const waitCols = (await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'waitlist'
        AND column_name IN ('role','program_name','athlete_count','tech_stack','referral','approved_at','invite_sent_at')
      ORDER BY 1`,
  )).rows.map((r) => r.column_name)
  assert.deepEqual(waitCols, [
    'approved_at', 'athlete_count', 'invite_sent_at', 'program_name', 'referral', 'role', 'tech_stack',
  ])

  const clipCols = (await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clips'
        AND column_name IN ('hitting_metrics','featured_youtube_id','featured_comparison_note')
      ORDER BY 1`,
  )).rows.map((r) => r.column_name)
  assert.deepEqual(clipCols, ['featured_comparison_note', 'featured_youtube_id', 'hitting_metrics'])

  assert.equal(
    readFileSync(M045, 'utf8'),
    readFileSync(PASTE, 'utf8'),
    'prod-sql-045 must be byte-identical to the migration',
  )
})
