-- ============================================================================
-- Migration 040: mark frozen under-13 accounts (for the 14-day deletion job)
-- ============================================================================
-- 1. profiles.frozen_at: when an under-13 answer froze this account (hard
--    stop). profiles.deletion_requested_at: when the account was marked for
--    deletion. The follow-up job (PR B) deletes accounts marked for deletion
--    14 days ago or more that still have no parent consent. The app sets both
--    (service role) when a signed-in player answers under 13, and blanks the
--    profile (name, photo and the other profile fields) at the same time.
-- 2. Users can't set, change or clear these two columns, and can't edit
--    their own profile at all once it's frozen (own-row insert or update
--    through the API). Only the service role (the app) or a SECURITY DEFINER
--    function can.
-- 3. Accounts already frozen by their own under-13 answer get both marks
--    (time of their answer). Accounts frozen by a coach's under-13 band
--    aren't marked here: PR B decides what happens to those.
--
-- Needs 021 (is_end_user_request), 037 and 039. Idempotent. One
-- transaction, then a read-only report.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_end_user_request()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'age_band_self')
     OR to_regclass('public.terms_acceptances') IS NULL THEN
    RAISE EXCEPTION 'Migration 040 needs migrations 021, 037 and 039 first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frozen_at             timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
COMMENT ON COLUMN public.profiles.frozen_at IS 'When an under-13 answer froze this account (set by the app).';
COMMENT ON COLUMN public.profiles.deletion_requested_at IS 'When this account was marked for deletion (set by the app); deleted 14 days later without parent consent.';
CREATE INDEX IF NOT EXISTS profiles_deletion_requested_at_idx
  ON public.profiles (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.profiles_guard_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.frozen_at IS NOT NULL OR NEW.deletion_requested_at IS NOT NULL THEN
        RAISE EXCEPTION 'profiles.frozen_at and deletion_requested_at are set by the app' USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'this account is on hold' USING ERRCODE = '42501';
    ELSIF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
       OR NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
      RAISE EXCEPTION 'profiles.frozen_at and deletion_requested_at are set by the app' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_freeze ON public.profiles;
CREATE TRIGGER profiles_guard_freeze
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_freeze();

-- Accounts already frozen by their own under-13 answer.
UPDATE public.profiles pr
   SET frozen_at             = coalesce(pr.frozen_at, pl.answered),
       deletion_requested_at = coalesce(pr.deletion_requested_at, pl.answered)
  FROM (SELECT user_id, min(coalesce(age_screen_at, age_confirmed_at, now())) AS answered
          FROM public.players
         WHERE user_id IS NOT NULL AND age_band = 'under_13' AND age_band_self = 'under_13'
         GROUP BY user_id) pl
 WHERE pr.id = pl.user_id
   AND (pr.frozen_at IS NULL OR pr.deletion_requested_at IS NULL);

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'profiles marked for deletion' AS item, count(*) AS n FROM public.profiles WHERE deletion_requested_at IS NOT NULL
UNION ALL
SELECT 'frozen profiles', count(*) FROM public.profiles WHERE frozen_at IS NOT NULL
UNION ALL
SELECT 'freeze guard trigger in place (expect 1)', count(*) FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_guard_freeze';
