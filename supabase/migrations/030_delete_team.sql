-- 030: delete a team in one step (QA-015).
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
-- Blocked: if a player on the team has no direct coach (coach_id NULL) and
-- this team is the only team linking them, deleting it would leave them with
-- no coach. delete_team then changes nothing and returns blocked = true with
-- the number of such players.
--
-- team_delete_preview(p_team_id) is read-only and returns the same numbers
-- for the confirm dialog: players some coach sees only through this team (they
-- disappear for that coach) and players who would be left with no coach.
--
-- SECURITY DEFINER because a team coach can't change players.team_id or
-- player_teams under RLS (022: direct coach writes players; player_teams is
-- service-role only), and can't read every link the counts need. Both
-- functions check the caller themselves with auth.uid(): anon can't execute
-- them; players and coaches who aren't on the team get allowed/deleted = false
-- and nothing changes. The delete runs in one transaction, so either the
-- whole delete happens or none of it does.
--
-- Needs 018. Safe to re-run. One transaction.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_coaches') IS NULL THEN
    RAISE EXCEPTION 'Migration 030 needs migration 018 (team_coaches) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('public.player_teams') IS NULL THEN
    RAISE EXCEPTION 'Migration 030 needs the player_teams table (migrations 011/012). Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- Internal: what deleting the team would do to players' coach access.
--   losing_access:   players on the team that at least one coach of the team
--                    (team_coaches or teams.coach_id) reaches only through this
--                    team: not their direct coach and not a coach on another
--                    team of theirs.
--   without_coach:   players on the team with coach_id NULL and no other team
--                    (player_teams or players.team_id).
CREATE OR REPLACE FUNCTION public.team_delete_counts(p_team_id uuid)
RETURNS TABLE (losing_access integer, without_coach integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH linked AS (
    SELECT p.id, p.coach_id, p.team_id
      FROM public.players p
     WHERE p.team_id = p_team_id
        OR EXISTS (SELECT 1 FROM public.player_teams pt WHERE pt.player_id = p.id AND pt.team_id = p_team_id)
  ),
  other_teams AS (
    SELECT l.id AS player_id, pt.team_id
      FROM linked l JOIN public.player_teams pt ON pt.player_id = l.id AND pt.team_id <> p_team_id
    UNION
    SELECT l.id, l.team_id FROM linked l WHERE l.team_id IS NOT NULL AND l.team_id <> p_team_id
  ),
  staff AS (
    SELECT tc.team_id, tc.coach_id FROM public.team_coaches tc
    UNION
    SELECT t.id, t.coach_id FROM public.teams t
  )
  SELECT
    (count(*) FILTER (WHERE EXISTS (
       SELECT 1 FROM staff s
        WHERE s.team_id = p_team_id
          AND s.coach_id IS DISTINCT FROM l.coach_id
          AND NOT EXISTS (SELECT 1 FROM other_teams o JOIN staff s2 ON s2.team_id = o.team_id
                           WHERE o.player_id = l.id AND s2.coach_id = s.coach_id)
    )))::integer,
    (count(*) FILTER (WHERE l.coach_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM other_teams o WHERE o.player_id = l.id)))::integer
  FROM linked l
$$;

-- Internal: the signed-in user owns or coaches the team.
CREATE OR REPLACE FUNCTION public.team_delete_allowed(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND p_team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t
     WHERE t.id = p_team_id
       AND (t.coach_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.team_coaches tc
                        WHERE tc.team_id = t.id AND tc.coach_id = auth.uid())))
$$;

-- allowed:                 false if the team doesn't exist or the caller isn't on it
--                          (the counts are then NULL).
-- players_losing_access:   see team_delete_counts.losing_access.
-- players_without_coach:   see team_delete_counts.without_coach; > 0 means
--                          delete_team will refuse.
CREATE OR REPLACE FUNCTION public.team_delete_preview(p_team_id uuid)
RETURNS TABLE (allowed boolean, players_losing_access integer, players_without_coach integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.team_delete_allowed(p_team_id) THEN
    RETURN QUERY SELECT false, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, c.losing_access, c.without_coach FROM public.team_delete_counts(p_team_id) c;
END;
$$;

-- An earlier draft of this function returned (deleted, team_name); the return
-- type changed, so drop it before creating it again.
DROP FUNCTION IF EXISTS public.delete_team(uuid);

-- deleted:                true if the team was deleted.
-- blocked:                true if nothing was deleted because players would be
--                         left with no coach (players_without_coach > 0).
-- team_name:              the team's name (NULL if not allowed or not found).
-- players_without_coach:  the number of those players (NULL if not allowed).
CREATE FUNCTION public.delete_team(p_team_id uuid)
RETURNS TABLE (deleted boolean, blocked boolean, team_name text, players_without_coach integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name    text;
  v_orphans integer;
BEGIN
  IF NOT public.team_delete_allowed(p_team_id) THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- Lock the team so the check and the delete see the same team.
  SELECT t.name INTO v_name FROM public.teams t WHERE t.id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT c.without_coach INTO v_orphans FROM public.team_delete_counts(p_team_id) c;
  IF v_orphans > 0 THEN
    RETURN QUERY SELECT false, true, v_name, v_orphans;
    RETURN;
  END IF;

  UPDATE public.players SET team_id = NULL WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN QUERY SELECT true, false, v_name, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.team_delete_counts(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_delete_allowed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_delete_preview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_team(uuid)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_delete_preview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_team(uuid)         TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
