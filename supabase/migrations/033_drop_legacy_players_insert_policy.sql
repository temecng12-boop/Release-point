-- ============================================================================
-- Migration 033: drop legacy INSERT policies on players
-- ============================================================================
-- Prod (zebjt) had an INSERT policy on public.players that no migration in this
-- repo creates: "players: coach can invite" (FOR INSERT TO public,
-- WITH CHECK (coach_id = auth.uid())). Permissive policies are OR'ed, so it
-- kept open the hole 032 closes: a coach could insert a players row linked to
-- someone else's account (user_id, accepted_at, consent_given_at, guardian_id).
-- 032's guard stopped on it; the Part 9 resume (paste2-part9-032-fix.sql)
-- dropped it on prod on 2026-10-03 and then ran 032. This migration records
-- that drop so every database ends the same way.
--
-- What it does:
--   * drops "players: coach can invite";
--   * drops any other permissive INSERT-only policy on players except ours
--     (players_coach_insert), logging its definition as a NOTICE. Every app
--     insert on players uses the service role, which bypasses RLS;
--   * stops (changing nothing) if a permissive FOR ALL policy exists on
--     players, since that one also grants reads and updates and needs review;
--   * stops if players_coach_insert is missing (run 032 first).
-- After it, the only permissive INSERT policy on players is players_coach_insert.
-- Already effectively applied on prod. Safe to re-run. One transaction.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "players: coach can invite" ON public.players;

DO $$
DECLARE
  pol   record;
  extra text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'players'
                    AND policyname = 'players_coach_insert' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'Migration 033 needs migration 032 (players_coach_insert) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO extra
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'players'
     AND cmd = 'ALL' AND permissive = 'PERMISSIVE';
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 033: FOR ALL policies on public.players (%) also allow inserts; review them by hand. Nothing was changed.', extra
      USING ERRCODE = 'P0001';
  END IF;

  FOR pol IN
    SELECT policyname, roles, with_check FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'players'
       AND cmd = 'INSERT' AND permissive = 'PERMISSIVE'
       AND policyname <> 'players_coach_insert'
  LOOP
    RAISE NOTICE 'Dropping legacy INSERT policy % on players (roles: %, check: %)', pol.policyname, pol.roles, pol.with_check;
    EXECUTE format('DROP POLICY %I ON public.players', pol.policyname);
  END LOOP;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
