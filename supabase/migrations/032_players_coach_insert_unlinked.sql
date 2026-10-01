-- ============================================================================
-- Migration 032: coaches may only insert unlinked players rows
-- ============================================================================
-- 022's players_coach_insert checked only coach_id = auth.uid(), and 021's
-- players_restrict_update trigger runs on UPDATE only. Through the API (anon
-- key + their own sign-in) a coach could therefore INSERT a players row with
-- any user_id (and accepted_at), i.e. link someone else's account to a row
-- they coach. That row then let the coach read the victim's profile
-- (profiles_coach_read_players), made the victim's own app write their
-- self-profile edits into it (the app updates players by user_id), and gave
-- the victim a second players row.
--
-- The same INSERT could also set consent_given_at (which the UPDATE trigger
-- forbids coaches) and name any guardian_id, which then let the coach read
-- that guardian row (guardians_coach_select goes through players.guardian_id).
--
-- After 032, an end-user INSERT on players must have (plus coach_id =
-- auth.uid(), as before):
--   * user_id IS NULL and accepted_at IS NULL;
--   * consent_given_at IS NULL (consent comes from the guardian or the
--     player later, never from the coach);
--   * guardian_id IS NULL or a guardian this coach created
--     (guardians.created_by = auth.uid(), the rule 021's update trigger uses).
--     The guardians subquery runs under guardians RLS as the caller; the
--     coach sees their own guardians through guardians_coach_select_created
--     (021), like the 021 trigger's lookup. No new recursion: the guardians
--     policies reach players only through SECURITY DEFINER helpers.
-- A row is linked to an account only later, by the account itself:
--   * invite accept: auth/callback and linkPlayerRow UPDATE the invited row
--     (email match, user_id IS NULL) with the service role;
--   * players_claim_by_email (021): the account's own UPDATE, user_id = auth.uid();
--   * player self-signup: linkPlayerRow INSERTs with the service role.
-- The service role bypasses RLS, so none of these change. No SECURITY DEFINER
-- function inserts players rows; 029 (promote_empty_player_to_guardian) and
-- 030 (delete_team) don't insert players. The app's coach add-player
-- (invite.ts) inserts with the service role and user_id NULL.
--
-- Needs 021 (guardians.created_by) and 022 (players_coach_insert; 018's FOR
-- ALL players_coach_all gone).
-- Re-running 022 later puts back the old check; run 032 again after it.
-- Safe to re-run (DROP POLICY IF EXISTS, then CREATE). One transaction.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  extra text;
BEGIN
  IF to_regclass('public.players') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'players' AND policyname = 'players_coach_select') THEN
    RAISE EXCEPTION 'Migration 032 needs migration 022 (split players policies) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'guardians' AND column_name = 'created_by') THEN
    RAISE EXCEPTION 'Migration 032 needs migration 021 (guardians.created_by) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  -- Any other permissive policy that allows INSERT on players would be OR'ed
  -- with this one and keep the hole open: stop instead of looking fixed.
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO extra
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'players'
     AND cmd IN ('INSERT', 'ALL') AND permissive = 'PERMISSIVE'
     AND policyname <> 'players_coach_insert';
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 032: other INSERT policies on public.players (%) would still allow linked inserts. Nothing was changed.', extra
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

DROP POLICY IF EXISTS "players_coach_insert" ON public.players;
CREATE POLICY "players_coach_insert" ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    AND user_id IS NULL
    AND accepted_at IS NULL
    AND consent_given_at IS NULL
    AND (guardian_id IS NULL
         OR guardian_id IN (SELECT g.id FROM public.guardians g WHERE g.created_by = auth.uid()))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
