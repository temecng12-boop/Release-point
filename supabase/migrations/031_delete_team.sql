-- 031: delete a team in one step (QA-015).
--
-- delete_team(p_team_id) deletes the team for the signed-in coach if they own
-- it (teams.coach_id) or coach on it (team_coaches, organizer or assistant).
-- Only the team and its links go:
--   * player_teams and team_coaches rows go through their ON DELETE CASCADE
--     (011/012, 018).
--   * players.team_id (001) has no ON DELETE action and would block the
--     delete, so it is set to NULL first.
-- Players, their clips and all their data stay. Players keep their direct
-- coach (players.coach_id).
--
-- SECURITY DEFINER because a team coach can't change players.team_id or
-- player_teams under RLS (022: direct coach writes players; player_teams is
-- service-role only). The function checks the caller itself with auth.uid():
-- anon, players and coaches who aren't on the team get deleted = false and
-- nothing changes. Both writes run in the function's single transaction, so
-- either the whole delete happens or none of it does.
--
-- Numbered 031 because 030 may be taken by the QA-017 fix (pitch rows).
-- Needs 018. Safe to re-run (CREATE OR REPLACE). One transaction.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_coaches') IS NULL THEN
    RAISE EXCEPTION 'Migration 031 needs migration 018 (team_coaches) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('public.player_teams') IS NULL THEN
    RAISE EXCEPTION 'Migration 031 needs the player_teams table (migrations 011/012). Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- deleted:   true if the team was deleted.
-- team_name: the deleted team's name (NULL when nothing was deleted).
CREATE OR REPLACE FUNCTION public.delete_team(p_team_id uuid)
RETURNS TABLE (deleted boolean, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL OR p_team_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  SELECT t.name INTO v_name
    FROM public.teams t
   WHERE t.id = p_team_id
     AND (t.coach_id = v_uid
          OR EXISTS (SELECT 1 FROM public.team_coaches tc
                      WHERE tc.team_id = t.id AND tc.coach_id = v_uid))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  UPDATE public.players SET team_id = NULL WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN QUERY SELECT true, v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_team(uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
