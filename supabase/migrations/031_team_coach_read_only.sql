-- ============================================================================
-- Migration 031: team coaches read, the direct coach writes (clips, teams,
-- team_coaches)
-- ============================================================================
-- 018 gave every coach on a player's team the same FOR ALL policy on clips
-- as the player's own coach, and gave every coach on a team FOR ALL on the
-- teams row. Through the API (anon key + their own sign-in) a team coach
-- could therefore update or delete any clip of a team player, and could
-- delete the team or take it over (UPDATE ... SET coach_id = themselves
-- passed teams_coach_all's WITH CHECK). The app never does any of this:
-- clip, team and team-coach writes go through server actions with the
-- service role (which bypasses RLS) after their own checks.
--
-- After 031:
--   clips         SELECT: direct coach + team coaches (unchanged).
--                 INSERT / UPDATE / DELETE: the player's direct coach
--                 (players.coach_id) only.
--                 Team coaches keep one write the app uses: saving coach
--                 notes through save_clip_notes() (027, SECURITY INVOKER).
--                 That UPDATE is allowed only while the transaction-local
--                 flag rp.clip_notes_rpc = 'on', which only save_clip_notes
--                 sets (the same flag 027's clips_notes_server_only trigger
--                 trusts); it can't be set through the API.
--                 Player and guardian SELECT policies are unchanged; clips
--                 has no player or uploader write policy (before or after).
--   teams         SELECT: owner + any coach on the team (unchanged).
--                 INSERT: owner row only (unchanged).
--                 UPDATE / DELETE: the owner (teams.coach_id) only, as 018's
--                 header intended. delete_team() (030) is SECURITY DEFINER
--                 and keeps its own rules.
--   team_coaches  SELECT unchanged. Organizers may add coaches as
--                 'assistant' only and remove only non-organizer rows, the
--                 same as addCoachToTeam / removeCoachFromTeam. The organizer
--                 row for a new team still comes from the 018 trigger
--                 (SECURITY DEFINER); deleting a team still cascades.
-- pitch_metrics, annotations, timestamp_notes, pitch_analysis,
-- bullpen_sessions, players, player_teams, guardians: no team-coach write
-- exists there (direct coach / service role only); not changed.
--
-- Dependencies: 018 (team_coaches, rls_my_coached_player_ids(),
-- rls_my_team_ids(), rls_my_organizer_team_ids()). Optional: 027
-- (save_clip_notes). Without 027 the team-coach notes policy never matches,
-- and the app saves notes with the service role.
-- Re-running 018 later would put back clips_coach_all and teams_coach_all;
-- run 031 again after it.
-- No new functions. Safe to re-run (DROP POLICY IF EXISTS, then CREATE).
-- One transaction.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_coaches') IS NULL
     OR to_regprocedure('public.rls_my_coached_player_ids()') IS NULL
     OR to_regprocedure('public.rls_my_team_ids()') IS NULL
     OR to_regprocedure('public.rls_my_organizer_team_ids()') IS NULL THEN
    RAISE EXCEPTION 'Migration 031 needs migration 018 (team_coaches and its rls_* helpers) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── clips ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clips_coach_all"               ON public.clips;
DROP POLICY IF EXISTS "clips_coach_select"            ON public.clips;
DROP POLICY IF EXISTS "clips_direct_coach_insert"     ON public.clips;
DROP POLICY IF EXISTS "clips_direct_coach_update"     ON public.clips;
DROP POLICY IF EXISTS "clips_direct_coach_delete"     ON public.clips;
DROP POLICY IF EXISTS "clips_team_coach_notes_update" ON public.clips;

-- Direct coach or a coach on the player's team (as in 018).
CREATE POLICY "clips_coach_select" ON public.clips
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT public.rls_my_coached_player_ids()));

CREATE POLICY "clips_direct_coach_insert" ON public.clips
  FOR INSERT TO authenticated
  WITH CHECK (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid()));

CREATE POLICY "clips_direct_coach_update" ON public.clips
  FOR UPDATE TO authenticated
  USING      (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid()));

CREATE POLICY "clips_direct_coach_delete" ON public.clips
  FOR DELETE TO authenticated
  USING (player_id IN (SELECT p.id FROM public.players p WHERE p.coach_id = auth.uid()));

-- Team coaches: only inside save_clip_notes() (027).
CREATE POLICY "clips_team_coach_notes_update" ON public.clips
  FOR UPDATE TO authenticated
  USING      (coalesce(current_setting('rp.clip_notes_rpc', true), '') = 'on'
              AND player_id IN (SELECT public.rls_my_coached_player_ids()))
  WITH CHECK (coalesce(current_setting('rp.clip_notes_rpc', true), '') = 'on'
              AND player_id IN (SELECT public.rls_my_coached_player_ids()));

-- ── teams ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teams_coach_all"    ON public.teams;
DROP POLICY IF EXISTS "teams_coach_select" ON public.teams;
DROP POLICY IF EXISTS "teams_owner_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_owner_update" ON public.teams;
DROP POLICY IF EXISTS "teams_owner_delete" ON public.teams;

CREATE POLICY "teams_coach_select" ON public.teams
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR id IN (SELECT public.rls_my_team_ids()));

CREATE POLICY "teams_owner_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "teams_owner_update" ON public.teams
  FOR UPDATE TO authenticated
  USING      (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "teams_owner_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (coach_id = auth.uid());

-- ── team_coaches ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team_coaches_insert" ON public.team_coaches;
CREATE POLICY "team_coaches_insert" ON public.team_coaches
  FOR INSERT TO authenticated
  WITH CHECK (role = 'assistant' AND team_id IN (SELECT public.rls_my_organizer_team_ids()));

DROP POLICY IF EXISTS "team_coaches_delete" ON public.team_coaches;
CREATE POLICY "team_coaches_delete" ON public.team_coaches
  FOR DELETE TO authenticated
  USING (role <> 'organizer' AND team_id IN (SELECT public.rls_my_organizer_team_ids()));

COMMIT;

NOTIFY pgrst, 'reload schema';
