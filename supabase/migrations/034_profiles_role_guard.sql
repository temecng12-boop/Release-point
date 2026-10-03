-- HOTFIX (2026-10-03): close the profiles role-lock bypass. Run in project zebjt. Safe to re-run.
-- Prod has a legacy policy "profiles: own row" (FOR ALL TO public, USING/CHECK id = auth.uid())
-- that no migration creates. 021 deliberately gave profiles no DELETE policy and a 'player'-only
-- self-insert, because the role trigger (profiles_prevent_role_change) is BEFORE UPDATE only.
-- The legacy FOR ALL policy is OR'ed with 021's, so any signed-in user can DELETE their own
-- profile and INSERT it again with role 'coach' or 'guardian' (and the delete nulls
-- clips.uploaded_by on their uploads through prod's ON DELETE SET NULL FK).
-- This: (1) stops if 021's three profiles policies are missing (nothing changed);
--       (2) drops "profiles: own row" (021's policies cover select/insert/update);
--       (3) adds a BEFORE INSERT OR DELETE guard so end-user requests can't delete a profile
--           or insert one with a role other than 'player', whatever policies exist.
-- Signup (handle_new_user, SECURITY DEFINER), the coach signUp upsert, recordConsent and
-- account deletion all run as the service role / definer, so they are not affected.
BEGIN;

DO $$
DECLARE missing text;
BEGIN
  IF to_regprocedure('public.is_end_user_request()') IS NULL THEN
    RAISE EXCEPTION 'Hotfix needs migration 021 (is_end_user_request). Nothing was changed.' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(n, ', ') INTO missing
    FROM unnest(ARRAY['profiles_select_own', 'profiles_insert_own', 'profiles_update_own']) AS n
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = n);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Hotfix: expected profiles policies missing (%). Nothing was changed.', missing USING ERRCODE = 'P0001';
  END IF;
END
$$;

DROP POLICY IF EXISTS "profiles: own row" ON public.profiles;

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

-- Read-only check (expect policy_gone = true, trigger_ok = true):
SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles: own row') AS policy_gone,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_guard_insert_delete' AND tgrelid = 'public.profiles'::regclass) AS trigger_ok;
