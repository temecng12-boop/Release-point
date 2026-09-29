-- ============================================================================
-- Migration 018: team coaches (organizer + assistants), non-recursive RLS
-- ============================================================================
-- Corrected replacement for the original 018 (upstream f1f9278), which was
-- never run in production. Same table, columns, backfill and access intent:
--   * team_coaches(team_id, coach_id, role 'organizer'|'assistant', joined_at)
--   * any coach on a team can see that team's coach list
--   * only the team's organizer can add or remove coaches
--   * coaches on a team can see and manage the team, its players and their
--     clips; only the owner (teams.coach_id) can change the teams row itself
--
-- What changed vs the original:
--   1. The original team_coaches policies selected from team_coaches inside
--      team_coaches' own policies. Postgres rejects that with 42P17 "infinite
--      recursion detected in policy for relation team_coaches", and because
--      the teams/players/clips policies also read team_coaches, every signed-in
--      (JWT) query on those tables failed. Lookups now go through SECURITY
--      DEFINER helpers (fixed search_path, STABLE), which read the tables as
--      the function owner without re-entering RLS.
--   2. 002's players <-> guardians policies also recurse (players reads
--      guardians, guardians_coach_select reads players), so signed-in queries
--      on players and clips failed even without team_coaches. Fixed here the
--      same way, with the same helper names and policies as section 0 of
--      014_tighten_rls.sql on security-fixes-2026-09, so applying that file
--      later is a no-op for this part.
--   3. "Player on the team" means players.team_id OR a player_teams row. The
--      app only writes player_teams (invite.ts, player.ts), so the original
--      players.team_id-only check never matched assistants.
--   4. New teams get their organizer row automatically (trigger on teams).
--      createTeam() doesn't write team_coaches, and the dashboard lists teams
--      from team_coaches, so new teams would otherwise not show up.
--
-- Safe to re-run, and safe on a database where the original 018 already ran:
-- CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS,
-- ON CONFLICT DO NOTHING.
-- ============================================================================

-- ── Table (same shape as the original 018) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_coaches (
  team_id   uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  coach_id  uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role      text NOT NULL DEFAULT 'assistant' CHECK (role IN ('organizer', 'assistant')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (team_id, coach_id)
);

CREATE INDEX IF NOT EXISTS team_coaches_coach_id_idx ON public.team_coaches(coach_id);

-- Backfill existing team owners as organizers.
INSERT INTO public.team_coaches (team_id, coach_id, role)
SELECT id, coach_id, 'organizer' FROM public.teams
ON CONFLICT DO NOTHING;

ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;

-- ── Helpers (SECURITY DEFINER: no RLS re-entry) ──────────────────────────────
-- Teams the signed-in user coaches on (organizer or assistant).
CREATE OR REPLACE FUNCTION public.rls_my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT team_id FROM public.team_coaches WHERE coach_id = auth.uid() $$;

-- Teams the signed-in user organizes.
CREATE OR REPLACE FUNCTION public.rls_my_organizer_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT team_id FROM public.team_coaches WHERE coach_id = auth.uid() AND role = 'organizer' $$;

-- Players the signed-in user coaches: directly (players.coach_id) or through a
-- team they coach on (players.team_id or player_teams).
CREATE OR REPLACE FUNCTION public.rls_my_coached_player_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.id FROM public.players p
  WHERE p.coach_id = auth.uid()
     OR p.team_id IN (SELECT tc.team_id FROM public.team_coaches tc WHERE tc.coach_id = auth.uid())
  UNION
  SELECT pt.player_id FROM public.player_teams pt
  WHERE pt.team_id IN (SELECT tc.team_id FROM public.team_coaches tc WHERE tc.coach_id = auth.uid())
$$;

-- players <-> guardians helpers (identical to 014_tighten_rls section 0).
CREATE OR REPLACE FUNCTION public.rls_my_guardian_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.guardians WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.rls_my_guardian_ids_by_email()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.guardians WHERE email = auth.email() $$;

CREATE OR REPLACE FUNCTION public.rls_coach_guardian_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT guardian_id FROM public.players WHERE coach_id = auth.uid() AND guardian_id IS NOT NULL $$;

REVOKE ALL ON FUNCTION public.rls_my_team_ids()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_organizer_team_ids()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_coached_player_ids()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_guardian_ids()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_guardian_ids_by_email() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_coach_guardian_ids()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_my_team_ids()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_my_organizer_team_ids()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_my_coached_player_ids()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_my_guardian_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_my_guardian_ids_by_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_coach_guardian_ids()       TO authenticated;

-- ── team_coaches policies ────────────────────────────────────────────────────
-- Any coach on a team can see who else is on that team.
DROP POLICY IF EXISTS "team_coaches_select" ON public.team_coaches;
CREATE POLICY "team_coaches_select" ON public.team_coaches
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.rls_my_team_ids()));

-- Only organizers can add or remove coaches.
DROP POLICY IF EXISTS "team_coaches_insert" ON public.team_coaches;
CREATE POLICY "team_coaches_insert" ON public.team_coaches
  FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT public.rls_my_organizer_team_ids()));

DROP POLICY IF EXISTS "team_coaches_delete" ON public.team_coaches;
CREATE POLICY "team_coaches_delete" ON public.team_coaches
  FOR DELETE TO authenticated
  USING (team_id IN (SELECT public.rls_my_organizer_team_ids()));

-- ── teams: owner or any coach on the team; only the owner writes ─────────────
DROP POLICY IF EXISTS "teams_coach_all" ON public.teams;
CREATE POLICY "teams_coach_all" ON public.teams
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR id IN (SELECT public.rls_my_team_ids()))
  WITH CHECK (coach_id = auth.uid());

-- ── players: direct coach or a coach on the player's team ────────────────────
DROP POLICY IF EXISTS "players_coach_all" ON public.players;
CREATE POLICY "players_coach_all" ON public.players
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR id IN (SELECT public.rls_my_coached_player_ids()))
  WITH CHECK (coach_id = auth.uid() OR id IN (SELECT public.rls_my_coached_player_ids()));

DROP POLICY IF EXISTS "players_guardian_select" ON public.players;
CREATE POLICY "players_guardian_select" ON public.players
  FOR SELECT TO authenticated
  USING (guardian_id IN (SELECT public.rls_my_guardian_ids()));

DROP POLICY IF EXISTS "players_guardian_read_by_email" ON public.players;
CREATE POLICY "players_guardian_read_by_email" ON public.players
  FOR SELECT TO authenticated
  USING (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()));

DROP POLICY IF EXISTS "players_guardian_consent_update" ON public.players;
CREATE POLICY "players_guardian_consent_update" ON public.players
  FOR UPDATE TO authenticated
  USING      (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()))
  WITH CHECK (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()));

DROP POLICY IF EXISTS "guardians_coach_select" ON public.guardians;
CREATE POLICY "guardians_coach_select" ON public.guardians
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.rls_coach_guardian_ids()));

-- ── clips: direct coach or a coach on the player's team ──────────────────────
DROP POLICY IF EXISTS "clips_coach_all" ON public.clips;
CREATE POLICY "clips_coach_all" ON public.clips
  FOR ALL TO authenticated
  USING      (player_id IN (SELECT public.rls_my_coached_player_ids()))
  WITH CHECK (player_id IN (SELECT public.rls_my_coached_player_ids()));

-- ── New teams: add the owner as organizer ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.team_coaches_add_organizer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.team_coaches (team_id, coach_id, role)
  VALUES (NEW.id, NEW.coach_id, 'organizer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.team_coaches_add_organizer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_coaches_add_organizer ON public.teams;
CREATE TRIGGER team_coaches_add_organizer
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.team_coaches_add_organizer();

NOTIFY pgrst, 'reload schema';
