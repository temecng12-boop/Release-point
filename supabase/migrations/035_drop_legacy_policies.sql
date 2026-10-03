-- ============================================================================
-- Migration 035: drop legacy RLS policies; one lessons storage set; clip paths
-- ============================================================================
-- A 2026-10-03 dump of pg_policies on prod (zebjt) found 27 policies that no
-- migration in this repo creates. Most date from before the migrations, and 4
-- come from a hand-run lessons step on 2026-09-29. Permissive policies are
-- OR'ed, so each one adds to what our own policies allow. Several undo
-- 021/022/024/031 rules:
--   * "coaches manage metrics" (FOR ALL, created_by = auth.uid(), no CHECK):
--     any signed-in user could add or edit pitch_metrics on any clip.
--   * "clips: player can upload own": players could insert clips rows directly
--     (the app inserts clips with the service role), with any storage_path.
--   * storage "coach upload" / "player upload own" check only the first path
--     segment: clip uploads without 024's consent check, and player uploads
--     below the top level.
--   * lessons_coach_write_* used rls_my_coached_player_ids(), so team coaches
--     could write lesson files (031 makes team coaches read-only).
--   * "profiles: own row" (FOR ALL) was dropped by 034 (profiles role guard);
--     here it is only DROP ... IF EXISTS.
-- The others are narrower copies of, or the same as, our own policies.
--
-- Also in this migration:
--   * Lessons bucket: exactly one set of policies, as tight as prod's
--     hand-applied set (paste 1, 4b) minus the team-coach write hole:
--       direct coach read/insert/delete  lessons_coach_select/_insert/_delete
--                                        (rls_my_direct_player_ids_text())
--       the player's own read            lessons_player_select
--       team coach read-only             lessons_team_coach_select
--                                        (rls_my_coached_player_ids(), SELECT only)
--     016's any-coach versions (same names) are replaced, and 016's
--     lessons_coach_update, the 2026-09-29 lessons_coach_write_* and
--     lessons_read_viewable_players are dropped. Guardians and the app read
--     lesson files through the server (service role + signed URLs).
--     rls_my_direct_player_ids_text() was never in a migration; it is created
--     here as on prod (paste 1, 4b, plus paste 2 part 5's search_path).
--   * clips: coach inserts and updates must keep storage_path under the
--     clip's player folder (storage_path starts with '<player_id>/'), which is
--     how the app names every clip (upload-button, record-button,
--     bulk-upload-modal; createClip checks it too). Only new writes are
--     checked; existing rows are not changed. The service role is not affected.
--
-- Every dropped policy has a replacement policy from our migrations. A
-- pre-check stops with "Nothing was changed" if any replacement is missing.
-- Needs 016, 021, 022, 024, 025, 028, 031, 032 and 034.
-- Safe to re-run. One transaction.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'profiles_guard_insert_delete' AND tgrelid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'Migration 035 needs migration 034 (profiles role guard) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'lessons') THEN
    RAISE EXCEPTION 'Migration 035 needs the lessons bucket (migration 016) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.rls_my_coached_player_ids()') IS NULL THEN
    RAISE EXCEPTION 'Migration 035 needs migration 018 (rls_my_coached_player_ids) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(e.sch || '.' || e.tbl || ' ' || e.pol, ', ' ORDER BY e.sch, e.tbl, e.pol) INTO missing
    FROM (VALUES
      ('public',  'annotations',   'annotations_coach_all'),
      ('public',  'annotations',   'annotations_player_select'),
      ('public',  'clips',         'clips_coach_select'),
      ('public',  'clips',         'clips_player_select'),
      ('public',  'clips',         'clips_direct_coach_insert'),
      ('public',  'clips',         'clips_direct_coach_update'),
      ('public',  'pitch_metrics', 'pitch_metrics_coach_all'),
      ('public',  'pitch_metrics', 'pitch_metrics_player_select'),
      ('public',  'players',       'players_coach_select'),
      ('public',  'players',       'players_coach_update'),
      ('public',  'players',       'players_coach_insert'),
      ('public',  'players',       'players_own_select'),
      ('public',  'profiles',      'profiles_select_own'),
      ('public',  'profiles',      'profiles_insert_own'),
      ('public',  'profiles',      'profiles_update_own'),
      ('public',  'teams',         'teams_coach_select'),
      ('public',  'teams',         'teams_owner_insert'),
      ('public',  'teams',         'teams_owner_update'),
      ('public',  'teams',         'teams_owner_delete'),
      ('storage', 'objects',       'clips_bucket_select'),
      ('storage', 'objects',       'clips_bucket_insert')
    ) AS e(sch, tbl, pol)
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = e.sch AND p.tablename = e.tbl AND p.policyname = e.pol);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 035: replacement policies missing (%). Nothing was changed.', missing
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── Legacy policies ─────────────────────────────────────────────────────────
-- annotations: annotations_coach_all / annotations_player_select cover these
DROP POLICY IF EXISTS "annotations: coach can create"                  ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach can delete own"              ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach can update own"              ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach reads"                       ON public.annotations;
DROP POLICY IF EXISTS "annotations: player reads own clip annotations" ON public.annotations;

-- clips: clips_direct_coach_insert/update, clips_coach_select, clips_player_select
-- (players never insert clips directly; createClip uses the service role)
DROP POLICY IF EXISTS "clips: coach can update"                ON public.clips;
DROP POLICY IF EXISTS "clips: coach can upload"                ON public.clips;
DROP POLICY IF EXISTS "clips: coach reads their players clips" ON public.clips;
DROP POLICY IF EXISTS "clips: player can upload own"           ON public.clips;
DROP POLICY IF EXISTS "clips: player reads own clips"          ON public.clips;
DROP POLICY IF EXISTS "coaches update clips"                   ON public.clips;

-- pitch_metrics: pitch_metrics_coach_all / pitch_metrics_player_select
DROP POLICY IF EXISTS "coaches manage metrics" ON public.pitch_metrics;
DROP POLICY IF EXISTS "players read metrics"   ON public.pitch_metrics;

-- players: players_coach_select/update/insert, players_own_select
DROP POLICY IF EXISTS "coaches update players"        ON public.players;
DROP POLICY IF EXISTS "players: coach can update"     ON public.players;
DROP POLICY IF EXISTS "players: coach reads roster"   ON public.players;
DROP POLICY IF EXISTS "players: player reads own row" ON public.players;
DROP POLICY IF EXISTS "players: coach can invite"     ON public.players;

-- profiles: already dropped by 034 on prod; no-op there
DROP POLICY IF EXISTS "profiles: own row" ON public.profiles;

-- teams: teams_owner_insert/update/delete, teams_coach_select
DROP POLICY IF EXISTS "coaches manage own teams" ON public.teams;

-- storage, clips bucket: 024's clips_bucket_* (consent, top-level rules)
DROP POLICY IF EXISTS "coach read"        ON storage.objects;
DROP POLICY IF EXISTS "coach upload"      ON storage.objects;
DROP POLICY IF EXISTS "player read own"   ON storage.objects;
DROP POLICY IF EXISTS "player upload own" ON storage.objects;

-- ── Lessons bucket: one set ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_my_direct_player_ids_text()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.id::text FROM public.players p WHERE p.coach_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.rls_my_direct_player_ids_text() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_my_direct_player_ids_text() TO authenticated, service_role;

DROP POLICY IF EXISTS "lessons_coach_write_delete"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_write_insert"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_write_update"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_read_viewable_players" ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_update"          ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_insert"          ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_select"          ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_delete"          ON storage.objects;
DROP POLICY IF EXISTS "lessons_player_select"         ON storage.objects;
DROP POLICY IF EXISTS "lessons_team_coach_select"     ON storage.objects;

-- Direct coach (players.coach_id): read, upload, delete. Same as prod's 4b.
CREATE POLICY "lessons_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lessons'
              AND (storage.foldername(name))[1] IN (SELECT public.rls_my_direct_player_ids_text()));

CREATE POLICY "lessons_coach_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lessons'
         AND (storage.foldername(name))[1] IN (SELECT public.rls_my_direct_player_ids_text()));

CREATE POLICY "lessons_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lessons'
         AND (storage.foldername(name))[1] IN (SELECT public.rls_my_direct_player_ids_text()));

-- The player's own folder: read only. Same as prod's 4b.
CREATE POLICY "lessons_player_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lessons'
         AND EXISTS (SELECT 1 FROM public.players p
                      WHERE p.user_id = auth.uid()
                        AND (storage.foldername(name))[1] = p.id::text));

-- Coaches on the player's team (018 helper; includes the direct coach): read only (031).
CREATE POLICY "lessons_team_coach_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lessons'
         AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.rls_my_coached_player_ids() AS id));

-- ── clips: storage_path must be under the clip's player folder ──────────────
DROP POLICY IF EXISTS "clips_direct_coach_insert" ON public.clips;
CREATE POLICY "clips_direct_coach_insert" ON public.clips
  FOR INSERT TO authenticated
  WITH CHECK (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid())
              AND starts_with(storage_path, player_id::text || '/'));

DROP POLICY IF EXISTS "clips_direct_coach_update" ON public.clips;
CREATE POLICY "clips_direct_coach_update" ON public.clips
  FOR UPDATE TO authenticated
  USING      (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid())
              AND starts_with(storage_path, player_id::text || '/'));

COMMIT;

NOTIFY pgrst, 'reload schema';
