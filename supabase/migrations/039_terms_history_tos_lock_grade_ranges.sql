-- ============================================================================
-- Migration 039: Terms history, Terms columns locked, grade ranges aren't ages
-- ============================================================================
-- 1. public.terms_acceptances: an append-only history of Terms acceptances
--    (id, user_id, tos_version, accepted_at; no IP or user agent). The app
--    writes one row at signup with the service role. A user can read only
--    their own rows. Nobody but the service role (or a SECURITY DEFINER
--    function) can insert, update or delete: users get no write grants and
--    no write policies, and a trigger refuses any end-user write anyway.
--    Rows go when the auth user is deleted (ON DELETE CASCADE).
--    profiles.tos_accepted_at / tos_version (037) stay as the latest copy.
--    Existing profiles.tos_accepted_at values are copied in once.
-- 2. profiles.tos_accepted_at and profiles.tos_version can't be set or
--    changed by the user (own-row insert or update through the API). Only
--    the service role (the app's signup code) or a definer function can.
-- 3. Grade ranges aren't ages. 037 read any range with a top of 12 or less
--    ("9-12", "8 to 10") as an under-13 age group, but "9-12" usually means
--    grades 9 to 12 (high school). Now only these count as under 13:
--      * U-number groups: "U8" to "U12", "12U", "under 12";
--      * an age range with the word "Youth": "Youth 10-12";
--      * the plain "Youth" (037's age_group_is_plain_youth, unchanged; only
--        while no band is known).
--    A bare range ("9-12", "10-12", "8 to 10") no longer counts. The app has
--    the same rule (ageGroupIsUnder13 in src/lib/age-band.ts). Players whose
--    band came from an age group are worked out again.
--
-- Needs 021 (is_end_user_request) and 037. Idempotent. One transaction, then
-- a read-only report.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_end_user_request()') IS NULL THEN
    RAISE EXCEPTION 'Migration 039 needs migration 021 (is_end_user_request) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.age_group_is_under_13(text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tos_version') THEN
    RAISE EXCEPTION 'Migration 039 needs migration 037 (age bands, profiles.tos_version) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. Terms acceptance history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tos_version text        NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terms_acceptances_user_id_idx ON public.terms_acceptances (user_id);

COMMENT ON TABLE public.terms_acceptances IS
  'Append-only Terms of Service acceptances, written by the app (service role) at signup. profiles.tos_accepted_at / tos_version hold the latest.';

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.terms_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;

DROP POLICY IF EXISTS "terms_acceptances_select_own" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_select_own" ON public.terms_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Append-only for users, whatever grants or policies are added later.
CREATE OR REPLACE FUNCTION public.terms_acceptances_no_user_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    RAISE EXCEPTION 'terms_acceptances is written by the app only' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS terms_acceptances_no_user_writes ON public.terms_acceptances;
CREATE TRIGGER terms_acceptances_no_user_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.terms_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.terms_acceptances_no_user_writes();

-- One-time copy of acceptances already on profiles (037). Safe to re-run.
INSERT INTO public.terms_acceptances (user_id, tos_version, accepted_at)
SELECT p.id, coalesce(p.tos_version, 'unrecorded'), p.tos_accepted_at
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
 WHERE p.tos_accepted_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.terms_acceptances t
                    WHERE t.user_id = p.id AND t.accepted_at = p.tos_accepted_at);

-- ── 2. profiles Terms columns: app only ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_tos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.tos_accepted_at IS NOT NULL OR NEW.tos_version IS NOT NULL THEN
        RAISE EXCEPTION 'profiles.tos_accepted_at and tos_version are set by the app' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.tos_accepted_at IS DISTINCT FROM OLD.tos_accepted_at
       OR NEW.tos_version IS DISTINCT FROM OLD.tos_version THEN
      RAISE EXCEPTION 'profiles.tos_accepted_at and tos_version are set by the app' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_tos ON public.profiles;
CREATE TRIGGER profiles_guard_tos
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_tos();

-- ── 3. Under-13 age groups: U-numbers and "Youth" ranges, not grade ranges ───
-- Same rule as ageGroupIsUnder13 in src/lib/age-band.ts.
CREATE OR REPLACE FUNCTION public.age_group_is_under_13(p_group text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  g text := lower(coalesce(p_group, ''));
  m text[];
BEGIN
  -- U-number groups: "U12", "u-10", "under 12", "12U".
  m := regexp_match(g, '(?:^|[^a-z0-9])(?:u|under)\s*-?\s*(\d{1,2})(?:[^0-9]|$)');
  IF m IS NOT NULL AND m[1]::int <= 12 THEN RETURN true; END IF;
  m := regexp_match(g, '(?:^|[^0-9])(\d{1,2})\s*-?\s*u(?:[^a-z]|$)');
  IF m IS NOT NULL AND m[1]::int <= 12 THEN RETURN true; END IF;
  -- An age range counts only with the word "Youth" ("Youth 10-12"); a bare
  -- range such as "9-12" is usually grades.
  IF g ~ '(^|[^a-z])youth([^a-z]|$)' THEN
    m := regexp_match(g, '(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})');
    IF m IS NOT NULL AND m[2]::int <= 12 THEN RETURN true; END IF;
  END IF;
  RETURN false;
END;
$$;

-- The new rule only ever counts fewer groups, so only bands that came from an
-- age group can change. players_set_age_band (037) works each one out again.
UPDATE public.players
   SET age_band = age_band
 WHERE age_band_source = 'age_group';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT 'players: ' || coalesce(age_band, 'unknown') || ' / ' || coalesce(age_band_source, '-')
         || CASE WHEN public.player_has_video_consent(id) THEN ' / video allowed' ELSE ' / video blocked' END AS item,
       count(*) AS n
  FROM public.players
 GROUP BY 1
UNION ALL
SELECT 'terms_acceptances rows', count(*) FROM public.terms_acceptances
UNION ALL
SELECT 'triggers in place (expect 2)', count(*)
  FROM pg_trigger
 WHERE NOT tgisinternal
   AND tgname IN ('terms_acceptances_no_user_writes', 'profiles_guard_tos')
 ORDER BY 1;
