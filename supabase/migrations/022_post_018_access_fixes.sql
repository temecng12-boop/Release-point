-- 022: access fixes that build on 018 (team_coaches). RP-041.
--
--   1. clips.notes: written only by the saveClipNotes server action (service
--      role). Direct browser (anon / authenticated) writes are rejected.
--   2. player_teams: no anon access. Signed-in users see only rows for players
--      they can view or teams they coach. Writes are service-role only.
--   3. clips.uploaded_by and pitch_metrics.created_by: nullable, and the
--      foreign key to auth.users becomes ON DELETE SET NULL.
--   4. players: team coaches (organizers and assistants) can read their
--      team's players but not change them. Only the direct coach
--      (players.coach_id) can insert, update or delete through RLS.
--
-- Needs 018, 019 and 020 applied first. Safe to re-run. Runs as one
-- transaction: if a prerequisite is missing, it stops at the first check and
-- changes nothing. The app's server code uses the service role and is
-- unaffected.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_coaches') IS NULL THEN
    RAISE EXCEPTION 'Migration 022 needs migration 018 (team_coaches) first. Run 018_team_coaches.sql, then run this file again.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('public.player_teams') IS NULL THEN
    RAISE EXCEPTION 'Migration 022 needs the player_teams table (migrations 011/012). Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.rls_my_coached_player_ids()') IS NULL THEN
    RAISE EXCEPTION 'Migration 022 needs migration 018 (rls_my_coached_player_ids). Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'career_stats') THEN
    RAISE EXCEPTION 'Migration 022 needs migration 019 (schema drift catch-up) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'pitch_metrics'
                    AND column_name = 'spin_axis' AND data_type = 'numeric') THEN
    RAISE EXCEPTION 'Migration 022 needs migration 020 (numeric spin_axis) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;


-- ============================================================================
-- 1. clips.notes: server action only
-- ============================================================================
-- Row-level policies can't restrict single columns, and a column REVOKE has no
-- effect while the table-level UPDATE grant exists, so a trigger checks it.
-- Other browser writes to clips (e.g. voice_path) are unaffected.
CREATE OR REPLACE FUNCTION public.clips_notes_server_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.notes IS NOT NULL THEN
      RAISE EXCEPTION 'clips.notes can only be set through the app''s save action'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'clips.notes can only be changed through the app''s save action'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_notes_server_only ON public.clips;
CREATE TRIGGER clips_notes_server_only
  BEFORE INSERT OR UPDATE ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.clips_notes_server_only();


-- ============================================================================
-- 2. player_teams: no anon access; readers limited by SECURITY DEFINER helpers
-- ============================================================================
-- Teams the caller coaches: organizer or assistant (team_coaches) or owner
-- (teams.coach_id).
CREATE OR REPLACE FUNCTION public.rls_pt_my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tc.team_id FROM public.team_coaches tc WHERE tc.coach_id = auth.uid()
  UNION
  SELECT t.id FROM public.teams t WHERE t.coach_id = auth.uid()
$$;

-- Players the caller can view: themself, their direct coach, a linked
-- guardian, or a coach on one of the player's teams (players.team_id or a
-- player_teams row). Same rule as the app's canViewPlayerContent.
CREATE OR REPLACE FUNCTION public.rls_pt_viewable_player_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM public.players p
   WHERE p.user_id = auth.uid()
      OR p.coach_id = auth.uid()
      OR p.guardian_id IN (SELECT g.id FROM public.guardians g WHERE g.user_id = auth.uid())
      OR p.team_id IN (SELECT public.rls_pt_my_team_ids())
  UNION
  SELECT pt.player_id FROM public.player_teams pt
   WHERE pt.team_id IN (SELECT public.rls_pt_my_team_ids())
$$;

REVOKE ALL ON FUNCTION public.rls_pt_my_team_ids()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_pt_viewable_player_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_pt_my_team_ids()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_pt_viewable_player_ids() TO authenticated, service_role;

ALTER TABLE public.player_teams ENABLE ROW LEVEL SECURITY;

-- Replace every existing policy on player_teams (whatever it is called), so a
-- permissive leftover can't widen access.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_teams' LOOP
    EXECUTE format('DROP POLICY %I ON public.player_teams', pol.policyname);
  END LOOP;
END
$$;

CREATE POLICY "player_teams_select_visible" ON public.player_teams
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT public.rls_pt_viewable_player_ids())
    OR team_id IN (SELECT public.rls_pt_my_team_ids())
  );

-- The app reads and writes player_teams with the service role (bypasses RLS).
REVOKE ALL ON public.player_teams FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.player_teams FROM authenticated;
GRANT SELECT ON public.player_teams TO authenticated;
GRANT ALL ON public.player_teams TO service_role;


-- ============================================================================
-- 3. clips.uploaded_by / pitch_metrics.created_by: nullable, ON DELETE SET NULL
-- ============================================================================
-- Existing foreign keys are found by column, not by assumed name.
DO $$
DECLARE
  spec   record;
  fk     record;
  n_ok   int;
  n_all  int;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('clips',         'uploaded_by', 'clips_uploaded_by_fkey'),
      ('pitch_metrics', 'created_by',  'pitch_metrics_created_by_fkey')
    ) AS v(tbl, col, new_name)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', spec.tbl, spec.col);

    SELECT count(*) FILTER (WHERE c.confdeltype = 'n' AND c.convalidated), count(*)
      INTO n_ok, n_all
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.conrelid = format('public.%I', spec.tbl)::regclass
       AND c.confrelid = 'auth.users'::regclass
       AND array_length(c.conkey, 1) = 1
       AND a.attname = spec.col;

    IF n_all = 1 AND n_ok = 1 THEN
      CONTINUE;  -- already ON DELETE SET NULL and validated
    END IF;

    FOR fk IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND c.conrelid = format('public.%I', spec.tbl)::regclass
         AND c.confrelid = 'auth.users'::regclass
         AND array_length(c.conkey, 1) = 1
         AND a.attname = spec.col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', spec.tbl, fk.conname);
    END LOOP;

    -- The new name could be taken by an unrelated constraint; don't clobber it.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = spec.new_name
                 AND conrelid = format('public.%I', spec.tbl)::regclass) THEN
      RAISE EXCEPTION 'Constraint % already exists on % and is not the %.% foreign key; rename it and re-run.',
        spec.new_name, spec.tbl, spec.tbl, spec.col;
    END IF;

    -- NOT VALID skips the full-table check while the lock is held; VALIDATE
    -- then checks existing rows under a lighter lock.
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID',
      spec.tbl, spec.new_name, spec.col);
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', spec.tbl, spec.new_name);
  END LOOP;
END
$$;


-- ============================================================================
-- 4. players: team coaches read only; direct coach writes
-- ============================================================================
-- 018's players_coach_all (FOR ALL) let any coach on the player's team update
-- or delete the row. It is split per command: SELECT keeps 018's reach;
-- INSERT, UPDATE and DELETE need coach_id = auth.uid(). WITH CHECK also
-- requires the new row's coach_id to be the caller, so a coach can't hand a
-- player to someone else. The guardian and claim policies are unchanged
-- (021's players_restrict_update trigger limits which columns they touch).
DROP POLICY IF EXISTS "players_coach_all"    ON public.players;
DROP POLICY IF EXISTS "players_coach_select" ON public.players;
DROP POLICY IF EXISTS "players_coach_insert" ON public.players;
DROP POLICY IF EXISTS "players_coach_update" ON public.players;
DROP POLICY IF EXISTS "players_coach_delete" ON public.players;

CREATE POLICY "players_coach_select" ON public.players
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR id IN (SELECT public.rls_my_coached_player_ids()));

CREATE POLICY "players_coach_insert" ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "players_coach_update" ON public.players
  FOR UPDATE TO authenticated
  USING      (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "players_coach_delete" ON public.players
  FOR DELETE TO authenticated
  USING (coach_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';
