-- ============================================================================
-- Migration 034: drop legacy RLS policies that no migration creates
-- ============================================================================
-- A 2026-10-03 dump of pg_policies on prod (zebjt) found 27 policies that no
-- migration in this repo creates. Most date from before the migrations, and 4
-- come from a hand-run lessons step on 2026-09-29. Permissive policies are
-- OR'ed, so each one adds to what our own policies allow. Several undo
-- 021/022/024/4b rules:
--   * "profiles: own row" (FOR ALL): a user could DELETE their profile and
--     INSERT it again with role 'coach' or 'guardian', getting around 021's role
--     lock (021 gives profiles no DELETE policy on purpose).
--   * "coaches manage metrics" (FOR ALL, created_by = auth.uid()): any
--     signed-in user could add or edit pitch_metrics on any clip.
--   * "clips: player can upload own": players could insert clips rows directly
--     (the app inserts clips with the service role), with any storage_path.
--   * storage "coach upload" / "player upload own": clip uploads without
--     024's consent check, and player uploads below the top level.
--   * lessons_coach_write_* / lessons_read_viewable_players: team coaches and
--     guardians kept direct lesson-file access that 4b limited to the direct
--     coach and the player.
-- The others are narrower copies of, or the same as, our own policies.
--
-- Every drop below has a replacement policy from our migrations. A pre-check
-- stops with "Nothing was changed" if any replacement is missing.
--
-- It also adds a BEFORE INSERT OR DELETE guard on profiles, so that an end-user
-- request can't delete a profile or insert one with a role other than 'player',
-- whatever policies exist. Signup (handle_new_user, SECURITY DEFINER), the
-- coach signUp upsert, recordConsent and account deletion run as the
-- definer or the service role, so they are not affected.
--
-- Needs 021, 022, 024, 025, 028, 031 and 032. Comes after 033 (players invite
-- policy), and also drops that policy if it is still there.
-- Already-dropped policies are skipped. Safe to re-run. One transaction.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  IF to_regprocedure('public.is_end_user_request()') IS NULL THEN
    RAISE EXCEPTION 'Migration 034 needs migration 021 (is_end_user_request) first. Nothing was changed.'
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
      ('storage', 'objects',       'clips_bucket_insert'),
      ('storage', 'objects',       'lessons_coach_select'),
      ('storage', 'objects',       'lessons_coach_insert'),
      ('storage', 'objects',       'lessons_coach_delete'),
      ('storage', 'objects',       'lessons_player_select')
    ) AS e(sch, tbl, pol)
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = e.sch AND p.tablename = e.tbl AND p.policyname = e.pol);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 034: replacement policies missing (%). Nothing was changed.', missing
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- annotations: annotations_coach_all / annotations_player_select cover these
DROP POLICY IF EXISTS "annotations: coach can create"                 ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach can delete own"             ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach can update own"             ON public.annotations;
DROP POLICY IF EXISTS "annotations: coach reads"                      ON public.annotations;
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

-- profiles: profiles_select_own / profiles_insert_own (player only) / profiles_update_own; no DELETE (021)
DROP POLICY IF EXISTS "profiles: own row" ON public.profiles;

-- teams: teams_owner_insert/update/delete, teams_coach_select
DROP POLICY IF EXISTS "coaches manage own teams" ON public.teams;

-- storage, clips bucket: 024's clips_bucket_*
DROP POLICY IF EXISTS "coach read"       ON storage.objects;
DROP POLICY IF EXISTS "coach upload"     ON storage.objects;
DROP POLICY IF EXISTS "player read own"  ON storage.objects;
DROP POLICY IF EXISTS "player upload own" ON storage.objects;

-- storage, lessons bucket: lessons_coach_* (direct coach) and lessons_player_select
DROP POLICY IF EXISTS "lessons_coach_write_delete"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_write_insert"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_coach_write_update"    ON storage.objects;
DROP POLICY IF EXISTS "lessons_read_viewable_players" ON storage.objects;

-- profiles: end users can't delete a profile or insert a non-player one
CREATE OR REPLACE FUNCTION public.profiles_guard_insert_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'profiles rows cannot be deleted by the user' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM 'player' THEN
      RAISE EXCEPTION 'profiles.role can only be set to player by the user' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_insert_delete ON public.profiles;
CREATE TRIGGER profiles_guard_insert_delete
  BEFORE INSERT OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_insert_delete();

COMMIT;

NOTIFY pgrst, 'reload schema';
