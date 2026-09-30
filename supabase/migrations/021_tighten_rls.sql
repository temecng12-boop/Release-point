-- ============================================================================
-- Migration 021: tighten row-level security
-- ============================================================================
-- Runs after 018 (team_coaches) and 019/020. Written from a review of the
-- migrations; the LIVE database may differ (dashboard edits, objects defined
-- outside the migrations). Review against the live policy state before
-- applying.
--
-- Section 0's helper functions and four players/guardians policies have the
-- same definitions as 018, so re-creating them here changes nothing.
-- player_teams access is set by 022.
--
-- Idempotent where practical: policies use DROP POLICY IF EXISTS, functions use
-- CREATE OR REPLACE, and triggers use DROP TRIGGER IF EXISTS.
-- Runs as one transaction: if any statement fails, nothing is changed.
--
-- Most app server code uses the service-role key, which BYPASSES RLS and
-- triggers that check for end-user roles. These rules mainly protect against
-- direct PostgREST calls made with the public anon key plus a user JWT.
--
-- "End-user request" below means current_user IN ('authenticated', 'anon'),
-- i.e. a PostgREST request made with a user/anon JWT. The service role,
-- postgres, and SECURITY DEFINER functions owned by postgres are not
-- restricted by the triggers.
-- ============================================================================

BEGIN;

-- ── Helper: is this an end-user (JWT) request? ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_end_user_request()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user IN ('authenticated', 'anon')
$$;


-- ============================================================================
-- 0. Break the players <-> guardians policy recursion (pre-existing bug)
-- ============================================================================
-- In 002, players policies select from guardians, and guardians_coach_select
-- selects from players. Postgres rejects this with "infinite recursion detected
-- in policy for relation players". Reproduced locally on a vanilla Postgres
-- with 001-013 applied: any end-user (JWT) query on players, clips,
-- pitch_metrics, guardians, or profiles errored. (The app mostly uses the
-- service role, which bypasses RLS, so this may not have been noticed. The live
-- DB may also have been patched in the dashboard; verify.)
--
-- Standard fix: move the cross-table lookups into SECURITY DEFINER helpers,
-- which run as the function owner and don't re-enter RLS.
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

REVOKE ALL ON FUNCTION public.rls_my_guardian_ids()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_my_guardian_ids_by_email() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_coach_guardian_ids()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_my_guardian_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_my_guardian_ids_by_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_coach_guardian_ids()       TO authenticated;

DROP POLICY IF EXISTS "players_guardian_select" ON players;
CREATE POLICY "players_guardian_select" ON players
  FOR SELECT TO authenticated
  USING (guardian_id IN (SELECT public.rls_my_guardian_ids()));

DROP POLICY IF EXISTS "players_guardian_read_by_email" ON players;
CREATE POLICY "players_guardian_read_by_email" ON players
  FOR SELECT TO authenticated
  USING (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()));

-- Column restrictions for this policy are enforced by players_restrict_update
-- (section 7).
DROP POLICY IF EXISTS "players_guardian_consent_update" ON players;
CREATE POLICY "players_guardian_consent_update" ON players
  FOR UPDATE TO authenticated
  USING      (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()))
  WITH CHECK (guardian_id IN (SELECT public.rls_my_guardian_ids_by_email()));

DROP POLICY IF EXISTS "guardians_coach_select" ON guardians;
CREATE POLICY "guardians_coach_select" ON guardians
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.rls_coach_guardian_ids()));


-- ============================================================================
-- 1. bullpen_sessions: RLS was never enabled (migrations 010 / 012)
-- ============================================================================
ALTER TABLE bullpen_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bullpen_coach_all"       ON bullpen_sessions;
DROP POLICY IF EXISTS "bullpen_player_select"   ON bullpen_sessions;
DROP POLICY IF EXISTS "bullpen_guardian_select" ON bullpen_sessions;

-- Coaches manage sessions they own, for players on their roster.
CREATE POLICY "bullpen_coach_all" ON bullpen_sessions
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid()
    AND player_id IN (SELECT id FROM players WHERE coach_id = auth.uid())
  )
  WITH CHECK (
    coach_id = auth.uid()
    AND player_id IN (SELECT id FROM players WHERE coach_id = auth.uid())
  );

-- Players read their own sessions.
CREATE POLICY "bullpen_player_select" ON bullpen_sessions
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- Linked guardians read their player's sessions.
CREATE POLICY "bullpen_guardian_select" ON bullpen_sessions
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM players p
      JOIN guardians g ON g.id = p.guardian_id
      WHERE g.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 2. player_teams: see migration 022
-- ============================================================================


-- ============================================================================
-- 3. pitch_analysis: was readable/writable by ANY user with role = 'coach'
-- ============================================================================
DROP POLICY IF EXISTS "coaches_all_pitch_analysis"      ON pitch_analysis;
DROP POLICY IF EXISTS "pitch_analysis_coach_all"        ON pitch_analysis;
DROP POLICY IF EXISTS "players_read_own_pitch_analysis" ON pitch_analysis;

CREATE POLICY "pitch_analysis_coach_all" ON pitch_analysis
  FOR ALL TO authenticated
  USING (player_id IN (SELECT id FROM players WHERE coach_id = auth.uid()))
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE coach_id = auth.uid())
    -- the clip must belong to the same player
    AND clip_id IN (SELECT c.id FROM clips c WHERE c.player_id = pitch_analysis.player_id)
  );

CREATE POLICY "players_read_own_pitch_analysis" ON pitch_analysis
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));


-- ============================================================================
-- 4. profiles: users could change their own role (FOR ALL policy on own row)
-- ============================================================================
DROP POLICY IF EXISTS "profiles_own"        ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Normally the profile row is created by handle_new_user() (or by server code
-- using the service role). A self-insert is allowed only as 'player'.
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'player');

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No DELETE policy on purpose. Deleting your own profile and re-inserting it
-- would otherwise be a way around the role lock. Account deletion runs on
-- the server with the service role (deleteAccount in src/app/actions/auth.ts,
-- src/lib/account-deletion.ts), which bypasses RLS.

-- Reject role changes made through an end-user request. The service role
-- (e.g. the coach signUp action, recordConsent) can still set roles.
CREATE OR REPLACE FUNCTION public.profiles_prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_end_user_request() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profiles.role cannot be changed by the user'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON profiles;
CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_role_change();


-- ============================================================================
-- 5. handle_new_user(): stop trusting arbitrary client role metadata
-- ============================================================================
-- PRODUCT NOTE: raw_user_meta_data is fully client-controlled, because anyone
-- can call supabase.auth.signUp() with any metadata. Before this change any
-- value accepted by the CHECK constraint, including 'guardian', was trusted.
--
-- Now only 'player' and 'coach' are accepted. Anything else, or a missing
-- value, becomes 'player'. 'guardian' can only be granted server-side
-- (recordConsent uses the service role).
--
-- 'coach' stays self-assignable because coach signup is self-serve today
-- (the signUp server action sets role 'coach' for anyone who submits the form).
-- If coach accounts should ever require approval, change the CASE below to
-- always return 'player' and grant 'coach' server-side. The signUp action
-- already upserts role = 'coach' with the service role, so that flow would
-- keep working.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('player', 'coach')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'player'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 6. guardians: insert was WITH CHECK (true) for any authenticated user
-- ============================================================================
-- A guardian row has no player reference (the link is players.guardian_id),
-- so the policy can't say "coach of that player" at insert time. Instead:
--   * record who created the row (created_by) and require it to be a coach;
--   * coaches can read and delete only guardian rows they created;
--   * players.guardian_id may only be pointed at a guardian row the coach
--     created (enforced by the players trigger in section 7).
-- NOTE: no app code inserts guardians today (see dev-review.md).
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users;
ALTER TABLE guardians ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "guardians_coach_insert"          ON guardians;
DROP POLICY IF EXISTS "guardians_coach_select_created"  ON guardians;
DROP POLICY IF EXISTS "guardians_coach_delete_created"  ON guardians;

CREATE POLICY "guardians_coach_insert" ON guardians
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND user_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "guardians_coach_select_created" ON guardians
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "guardians_coach_delete_created" ON guardians
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND user_id IS NULL);

-- guardians_claim_by_email / guardians_own allowed changing ANY column,
-- including setting user_id to someone else. For end-user updates:
--   * a guardian claiming or updating their own row may change only user_id
--     (set to themselves) and full_name;
--   * email and created_by are immutable.
CREATE OR REPLACE FUNCTION public.guardians_restrict_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'guardians.user_id can only be set to the current user' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['user_id', 'full_name']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['user_id', 'full_name']) THEN
    RAISE EXCEPTION 'only user_id and full_name may be changed on guardians' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardians_restrict_update ON guardians;
CREATE TRIGGER guardians_restrict_update
  BEFORE UPDATE ON guardians
  FOR EACH ROW EXECUTE FUNCTION public.guardians_restrict_update();


-- ============================================================================
-- 7. players: limit which columns each non-service actor may change
-- ============================================================================
-- players_guardian_consent_update and players_claim_by_email allowed updating
-- EVERY column (coach_id, guardian_id, email, ...). RLS can't restrict columns
-- per policy, so a BEFORE UPDATE trigger enforces this for end-user requests:
--
--   * Coach (OLD.coach_id = auth.uid()): may edit roster/profile fields but
--     NOT consent_given_at, user_id, accepted_at, or email once claimed.
--     guardian_id may only point at a guardian row they created.
--     (players_coach_all's WITH CHECK already pins coach_id = auth.uid().)
--   * Claiming player (OLD.user_id IS NULL AND OLD.email = auth.email()):
--     may change only user_id (to themselves) and accepted_at.
--   * Guardian of the player (by guardian email or guardian.user_id): may
--     change only consent_given_at.
--   * Anyone else: no changes (RLS should already block this).
--
-- Current app code does these writes with the service role, so it's
-- unaffected.
CREATE OR REPLACE FUNCTION public.players_restrict_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  uid       uuid := auth.uid();
  uemail    text := auth.email();
  allowed   text[] := ARRAY[]::text[];
  is_coach  boolean := OLD.coach_id IS NOT NULL AND OLD.coach_id = uid;
  is_claim  boolean := OLD.user_id IS NULL AND OLD.email IS NOT NULL AND OLD.email = uemail;
  is_guard  boolean := OLD.guardian_id IS NOT NULL AND EXISTS (
                         SELECT 1 FROM guardians g
                         WHERE g.id = OLD.guardian_id
                           AND (g.user_id = uid OR g.email = uemail)
                       );
BEGIN
  -- SECURITY INVOKER: the guardians lookups above run under the caller's RLS.
  -- Guardians can see their own row by email or user_id, and coaches can see
  -- rows they created, which is all these checks need.
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;

  IF is_coach THEN
    IF NEW.consent_given_at IS DISTINCT FROM OLD.consent_given_at THEN
      RAISE EXCEPTION 'coaches cannot set guardian consent' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
      RAISE EXCEPTION 'coaches cannot change the linked player account' USING ERRCODE = '42501';
    END IF;
    IF OLD.user_id IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'email cannot be changed after the player has claimed the account' USING ERRCODE = '42501';
    END IF;
    IF NEW.guardian_id IS DISTINCT FROM OLD.guardian_id AND NEW.guardian_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.id = NEW.guardian_id AND g.created_by = uid) THEN
      RAISE EXCEPTION 'guardian_id must reference a guardian you created' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF is_claim THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'players.user_id can only be set to the current user' USING ERRCODE = '42501';
    END IF;
    allowed := allowed || ARRAY['user_id', 'accepted_at'];
  END IF;

  IF is_guard THEN
    allowed := allowed || ARRAY['consent_given_at'];
  END IF;

  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'update touches columns you are not allowed to change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_restrict_update ON players;
CREATE TRIGGER players_restrict_update
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION public.players_restrict_update();

-- Replace the claim policy so the new row must also be linked to the caller.
DROP POLICY IF EXISTS "players_claim_by_email" ON players;
CREATE POLICY "players_claim_by_email" ON players
  FOR UPDATE TO authenticated
  USING  (email = auth.email() AND user_id IS NULL)
  WITH CHECK (email = auth.email() AND user_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';
