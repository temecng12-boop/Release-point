-- ============================================================================
-- Migration 041: platform admins + early-access coach invites
-- ============================================================================
-- Slim v1 for invite-only coach onboarding (public /auth/signup stays a
-- waitlist holding page):
--
-- 1. profiles.is_platform_admin: the founder (and later staff) can invite
--    coaches from the product. handle_new_user only writes
--    (id, full_name, role), so signup can never set this flag; the new
--    profiles_guard_platform_admin trigger also refuses any end-user request
--    that grants or clears it. Only the service role (the app, this seed)
--    can change it.
-- 2. public.coach_invites: one row per invited coach email (lower(email) is
--    unique so Casey is never double-invited). token is rotated on resend;
--    accepted_at is set when the invite link is first used. RLS is on with
--    no end-user policies: only the service role reads/writes it.
-- 3. Seeds temecng12@gmail.com as platform admin (no-op when the auth user
--    or profile doesn't exist yet; safe to re-run).
--
-- Needs 021 (is_end_user_request). Idempotent. One transaction.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_end_user_request()') IS NULL THEN
    RAISE EXCEPTION 'Migration 041 needs migration 021 (is_end_user_request) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. Platform admin flag ───────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Platform admin (founder/staff): may send early-access coach invites. Granted by the app only, never by signup or the user.';
CREATE INDEX IF NOT EXISTS profiles_platform_admin_idx
  ON public.profiles (is_platform_admin) WHERE is_platform_admin;

CREATE OR REPLACE FUNCTION public.profiles_guard_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_platform_admin IS TRUE THEN
        RAISE EXCEPTION 'platform admin is granted by the app' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
      RAISE EXCEPTION 'platform admin is granted by the app' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_platform_admin ON public.profiles;
CREATE TRIGGER profiles_guard_platform_admin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_platform_admin();

-- Helper for future policies and checks (the app uses the service role).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin) $$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ── 2. Coach invites ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  invited_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  token       uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
COMMENT ON TABLE public.coach_invites IS
  'Early-access coach invites sent by a platform admin. One row per email; accepted_at is set when the invite link is first used.';
CREATE UNIQUE INDEX IF NOT EXISTS coach_invites_email_unique ON public.coach_invites (lower(email));

ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;
-- No end-user policies on purpose: the app reads/writes this with the
-- service role only. Non-admins can't invite coaches (checked server-side).
REVOKE ALL ON public.coach_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coach_invites TO service_role;

-- ── 3. Founder access ────────────────────────────────────────────────────────
UPDATE public.profiles
   SET is_platform_admin = true
 WHERE id IN (SELECT id FROM auth.users WHERE lower(email) = lower('temecng12@gmail.com'))
   AND NOT is_platform_admin;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ───────────────
SELECT 'platform admins' AS item, count(*) AS n FROM public.profiles WHERE is_platform_admin
UNION ALL
SELECT 'coach invites sent', count(*) FROM public.coach_invites
UNION ALL
SELECT 'coach invites accepted', count(*) FROM public.coach_invites WHERE accepted_at IS NOT NULL
UNION ALL
SELECT 'platform admin guard trigger in place (expect 1)', count(*) FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_guard_platform_admin';
