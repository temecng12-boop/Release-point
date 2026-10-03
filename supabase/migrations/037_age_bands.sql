-- ============================================================================
-- Migration 037: player age bands; video only for confirmed 13+ players
-- ============================================================================
-- Compliance spec (compliance/under13-consent-spec.md, PR A). Under 13 is a
-- hard stop for now: there is no parent-consent flow yet, so video can't be
-- added for an under-13 player at all.
--
-- New columns:
--   players.age_band_coach   the coach's answer (invite, team invite, Edit Player)
--   players.age_band_self    the player's answer (birth month/year screen)
--   players.age_band         the effective band = the YOUNGER of the answers
--                            above and any under-13 age group (below); set by
--                            the players_set_age_band trigger, never by hand
--   players.age_band_source  'coach' | 'self' | 'age_group': which one decided it
--   players.age_screen_at    when the player answered the age screen
--   players.age_confirmed_at when the effective band was last set
--   players.age_confirmed_by who gave the deciding answer (NULL for age_group)
--   profiles.tos_accepted_at when the account accepted the Terms (signup)
-- Bands: 'under_13' | '13_17' | '18_plus'. NULL = unknown.
-- The birth month and year are never stored: the app turns them into a band
-- and drops them (spec T1, data minimization).
--
-- Under-13 age groups: an age group whose top age is 12 or less ("Youth
-- 10-12", "8-10", "12U", "U12") counts as an under-13 answer, from the
-- player's own age_group or any of their teams (players.team_id or
-- player_teams). public.age_group_is_under_13() is the rule; the app has the
-- same one in src/lib/age-band.ts.
--
-- 023's adult_confirmed_at / adult_confirmed_by are kept in step for older
-- code: set when the effective band is 18_plus, cleared for any other band. An
-- older app version that still writes only adult_confirmed_at (service role)
-- is turned into an 18_plus answer from the coach, or from the player if
-- adult_confirmed_by is the player's own account.
--
-- Video rule (public.player_has_video_consent: the clips trigger, 024's clips
-- bucket policies and, new here, the lessons bucket insert policy):
--   allowed only when age_band IN ('13_17', '18_plus') AND age_confirmed_at IS
--   NOT NULL. Unknown band: blocked. under_13: blocked (hard stop; PR B adds
--   admin-approved parent consent). consent_given_at no longer allows video
--   on its own: the old one-click consent never verified a parent.
-- src/lib/consent.ts implements the same rule for the app.
--
-- Security (spec section 0):
--   P2  players_restrict_update: guardians can no longer change any players
--       column (consent_given_at was allowed). Prod's legacy
--       players_guardian_consent_update policy is dropped.
--   P3  coaches can't change adult_confirmed_*, age_band*, age_screen_at,
--       age_confirmed_* or consent_given_at on their players through the API,
--       and new players_restrict_insert stops them inserting rows with those
--       set. The app writes them with the service role after its own checks
--       (coach-only server actions, younger-band rule).
--   P4  guardians_coach_insert is dropped: the parent flow is paused, and the
--       app never inserts guardians as the coach.
--   P6  lessons_coach_insert (035) also needs player_has_video_consent.
--
-- Backfill (one time, only rows with no answers yet): adult_confirmed_at set
-- -> an 18_plus answer from the coach (or the player, if they confirmed it
-- themself). The trigger then works out the band, so an 18+ player in an
-- under-13 age group becomes under_13. Nobody gets age_screen_at: invited
-- players see the age screen at their next sign-in.
--
-- Needs 021, 023, 024 and 035. Idempotent. One transaction.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'adult_confirmed_at')
     OR to_regprocedure('public.player_has_video_consent(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration 037 needs migration 023 (players.adult_confirmed_at, player_has_video_consent) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.players_restrict_update()') IS NULL THEN
    RAISE EXCEPTION 'Migration 037 needs migration 021 (players_restrict_update) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.clip_object_player_id(text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 037 needs migration 024 (clip_object_player_id) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.rls_my_direct_player_ids_text()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lessons_team_coach_select') THEN
    RAISE EXCEPTION 'Migration 037 needs migration 035 (lessons policies) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_band         text;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_band_coach   text;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_band_self    text;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_band_source  text;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_screen_at    timestamptz;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_confirmed_by uuid REFERENCES auth.users ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_accepted_at  timestamptz;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('players_age_band_check',        'age_band IS NULL OR age_band IN (''under_13'', ''13_17'', ''18_plus'')'),
    ('players_age_band_coach_check',  'age_band_coach IS NULL OR age_band_coach IN (''under_13'', ''13_17'', ''18_plus'')'),
    ('players_age_band_self_check',   'age_band_self IS NULL OR age_band_self IN (''under_13'', ''13_17'', ''18_plus'')'),
    ('players_age_band_source_check', 'age_band_source IS NULL OR age_band_source IN (''coach'', ''self'', ''age_group'')'),
    ('players_age_band_confirmed_check', 'age_band IS NULL OR age_confirmed_at IS NOT NULL')
  ) AS t(name, expr) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.players'::regclass AND conname = c.name) THEN
      EXECUTE format('ALTER TABLE public.players ADD CONSTRAINT %I CHECK (%s)', c.name, c.expr);
    END IF;
  END LOOP;
END
$$;

COMMENT ON COLUMN public.players.age_band IS
  'Effective band (younger of coach, self and under-13 age group); set by trigger players_set_age_band. under_13 | 13_17 | 18_plus; NULL = unknown.';
COMMENT ON COLUMN public.players.age_band_coach  IS 'The coach''s band answer.';
COMMENT ON COLUMN public.players.age_band_self   IS 'The player''s band answer from the birth month/year screen (month/year not stored).';
COMMENT ON COLUMN public.players.age_band_source IS 'coach | self | age_group: which answer decided age_band.';
COMMENT ON COLUMN public.players.age_screen_at   IS 'When the player answered the age screen.';
COMMENT ON COLUMN public.players.age_confirmed_at IS 'When age_band was last set.';
COMMENT ON COLUMN public.players.age_confirmed_by IS 'Who gave the deciding answer (coach or player); NULL when an age group decided it.';
COMMENT ON COLUMN public.profiles.tos_accepted_at IS 'When this account accepted the Terms of Service at signup.';

-- ── Band helpers ─────────────────────────────────────────────────────────────
-- True for an age group whose top age is 12 or less: "Youth 10-12", "8 to 10",
-- "12U", "U12", "under 12". Same rule as ageGroupIsUnder13 in src/lib/age-band.ts.
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
  m := regexp_match(g, '(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})');
  IF m IS NOT NULL AND m[2]::int <= 12 THEN RETURN true; END IF;
  m := regexp_match(g, '(?:^|[^a-z0-9])(?:u|under)\s*-?\s*(\d{1,2})(?:[^0-9]|$)');
  IF m IS NOT NULL AND m[1]::int <= 12 THEN RETURN true; END IF;
  m := regexp_match(g, '(?:^|[^0-9])(\d{1,2})\s*-?\s*u(?:[^a-z]|$)');
  IF m IS NOT NULL AND m[1]::int <= 12 THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.age_band_rank(p_band text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_band WHEN 'under_13' THEN 1 WHEN '13_17' THEN 2 WHEN '18_plus' THEN 3 END
$$;

-- True if the player, or any of their teams, has an under-13 age group.
CREATE OR REPLACE FUNCTION public.player_in_under_13_group(p_player_id uuid, p_age_group text, p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.age_group_is_under_13(p_age_group)
      OR EXISTS (SELECT 1 FROM public.teams t
                  WHERE (t.id = p_team_id
                         OR t.id IN (SELECT pt.team_id FROM public.player_teams pt WHERE pt.player_id = p_player_id))
                    AND public.age_group_is_under_13(t.age_group))
$$;
REVOKE ALL ON FUNCTION public.player_in_under_13_group(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── Effective band trigger ───────────────────────────────────────────────────
-- SECURITY DEFINER: it reads teams/player_teams whatever the caller's RLS.
CREATE OR REPLACE FUNCTION public.players_set_age_band()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  eff    text;
  src    text;
  by_uid uuid;
BEGIN
  -- Older app code (before this migration's app change) writes only
  -- adult_confirmed_at: treat it as an 18_plus answer.
  IF NEW.adult_confirmed_at IS NOT NULL
     AND NEW.age_band_coach IS NULL AND NEW.age_band_self IS NULL
     AND (TG_OP = 'INSERT' OR OLD.adult_confirmed_at IS NULL) THEN
    IF NEW.user_id IS NOT NULL AND NEW.adult_confirmed_by = NEW.user_id THEN
      NEW.age_band_self := '18_plus';
    ELSE
      NEW.age_band_coach := '18_plus';
    END IF;
  END IF;

  IF NEW.age_band_self IS NOT NULL
     AND (NEW.age_band_coach IS NULL OR public.age_band_rank(NEW.age_band_self) < public.age_band_rank(NEW.age_band_coach)) THEN
    eff := NEW.age_band_self; src := 'self'; by_uid := NEW.user_id;
  ELSIF NEW.age_band_coach IS NOT NULL THEN
    eff := NEW.age_band_coach; src := 'coach'; by_uid := NEW.coach_id;
  END IF;
  IF eff IS DISTINCT FROM 'under_13'
     AND public.player_in_under_13_group(NEW.id, NEW.age_group, NEW.team_id) THEN
    eff := 'under_13'; src := 'age_group'; by_uid := NULL;
  END IF;

  IF eff IS NULL THEN
    NEW.age_band := NULL; NEW.age_band_source := NULL;
    NEW.age_confirmed_at := NULL; NEW.age_confirmed_by := NULL;
    RETURN NEW;
  END IF;

  -- A new or changed band gets a new confirmation time, unless the writer
  -- (service role: app or backfill) set one itself.
  IF TG_OP = 'INSERT' THEN
    NEW.age_confirmed_at := coalesce(NEW.age_confirmed_at, now());
    NEW.age_confirmed_by := coalesce(NEW.age_confirmed_by, by_uid);
  ELSIF OLD.age_band IS DISTINCT FROM eff OR OLD.age_band_source IS DISTINCT FROM src OR NEW.age_confirmed_at IS NULL THEN
    IF NEW.age_confirmed_at IS NULL OR NEW.age_confirmed_at IS NOT DISTINCT FROM OLD.age_confirmed_at THEN
      NEW.age_confirmed_at := now();
    END IF;
    IF NEW.age_confirmed_by IS NOT DISTINCT FROM OLD.age_confirmed_by THEN
      NEW.age_confirmed_by := by_uid;
    END IF;
  END IF;
  NEW.age_band := eff;
  NEW.age_band_source := src;

  IF eff = '18_plus' THEN
    NEW.adult_confirmed_at := coalesce(NEW.adult_confirmed_at, NEW.age_confirmed_at);
    NEW.adult_confirmed_by := coalesce(NEW.adult_confirmed_by, NEW.age_confirmed_by);
  ELSE
    NEW.adult_confirmed_at := NULL;
    NEW.adult_confirmed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.players_set_age_band() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS players_set_age_band ON public.players;
CREATE TRIGGER players_set_age_band
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_set_age_band();

-- Team changes can add or remove an under-13 age group: recompute the band.
-- SECURITY DEFINER so the no-op update isn't an end-user write (021's
-- players_restrict_update only checks end-user requests).
CREATE OR REPLACE FUNCTION public.players_recompute_age_band()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'player_teams' THEN
    UPDATE public.players SET age_band = age_band
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.player_id ELSE NEW.player_id END;
  ELSIF TG_TABLE_NAME = 'teams' THEN
    UPDATE public.players SET age_band = age_band
     WHERE team_id = NEW.id
        OR id IN (SELECT pt.player_id FROM public.player_teams pt WHERE pt.team_id = NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.players_recompute_age_band() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS player_teams_recompute_age_band ON public.player_teams;
CREATE TRIGGER player_teams_recompute_age_band
  AFTER INSERT OR DELETE ON public.player_teams
  FOR EACH ROW EXECUTE FUNCTION public.players_recompute_age_band();

DROP TRIGGER IF EXISTS teams_recompute_age_band ON public.teams;
CREATE TRIGGER teams_recompute_age_band
  AFTER UPDATE OF age_group ON public.teams
  FOR EACH ROW WHEN (OLD.age_group IS DISTINCT FROM NEW.age_group)
  EXECUTE FUNCTION public.players_recompute_age_band();

-- ── Who may write what (P2, P3) ──────────────────────────────────────────────
-- Same as 021's function, except: guardians may change nothing (P2), and a
-- coach may not change the age or consent columns (P3).
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
  protected text[] := ARRAY['consent_given_at', 'adult_confirmed_at', 'adult_confirmed_by',
                            'age_band', 'age_band_coach', 'age_band_self', 'age_band_source',
                            'age_screen_at', 'age_confirmed_at', 'age_confirmed_by'];
  col       text;
BEGIN
  IF NOT public.is_end_user_request() THEN
    RETURN NEW;
  END IF;

  IF is_coach THEN
    FOREACH col IN ARRAY protected LOOP
      IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
        IF col = 'consent_given_at' THEN
          RAISE EXCEPTION 'coaches cannot set guardian consent' USING ERRCODE = '42501';
        END IF;
        RAISE EXCEPTION 'coaches cannot change % directly; use the app', col USING ERRCODE = '42501';
      END IF;
    END LOOP;
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

  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'update touches columns you are not allowed to change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_restrict_update ON public.players;
CREATE TRIGGER players_restrict_update
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_restrict_update();

-- End-user inserts (032's players_coach_insert) can't carry age or 18+ answers.
-- Runs before players_set_age_band (triggers fire in name order).
CREATE OR REPLACE FUNCTION public.players_restrict_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_end_user_request()
     AND (NEW.adult_confirmed_at IS NOT NULL OR NEW.adult_confirmed_by IS NOT NULL
          OR NEW.age_band IS NOT NULL OR NEW.age_band_coach IS NOT NULL OR NEW.age_band_self IS NOT NULL
          OR NEW.age_band_source IS NOT NULL OR NEW.age_screen_at IS NOT NULL
          OR NEW.age_confirmed_at IS NOT NULL OR NEW.age_confirmed_by IS NOT NULL
          OR NEW.consent_given_at IS NOT NULL) THEN
    RAISE EXCEPTION 'age and consent fields are set by the app, not directly' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_restrict_insert ON public.players;
CREATE TRIGGER players_restrict_insert
  BEFORE INSERT ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_restrict_insert();

DROP POLICY IF EXISTS "players_guardian_consent_update" ON public.players;  -- P2 (prod legacy)
DROP POLICY IF EXISTS "guardians_coach_insert"          ON public.guardians; -- P4

-- ── Backfill: 18+ confirmations become an 18_plus answer ─────────────────────
UPDATE public.players
   SET age_band_self = CASE WHEN user_id IS NOT NULL AND adult_confirmed_by = user_id THEN '18_plus' END,
       age_band_coach = CASE WHEN user_id IS NOT NULL AND adult_confirmed_by = user_id THEN NULL ELSE '18_plus' END,
       age_confirmed_at = adult_confirmed_at,
       age_confirmed_by = adult_confirmed_by
 WHERE adult_confirmed_at IS NOT NULL
   AND age_band_coach IS NULL AND age_band_self IS NULL;

-- ── Video rule ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_has_video_consent(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
     WHERE id = p_player_id
       AND age_band IN ('13_17', '18_plus')
       AND age_confirmed_at IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION public.player_has_video_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_has_video_consent(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clips_require_video_consent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.player_has_video_consent(NEW.player_id) THEN
    RAISE EXCEPTION 'video consent for this player is still pending'
      USING ERRCODE = '42501',
            HINT = 'Video needs a confirmed age band of 13_17 or 18_plus. Under 13 is not available yet.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_require_video_consent ON public.clips;
CREATE TRIGGER clips_require_video_consent
  BEFORE INSERT OR UPDATE OF player_id ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.clips_require_video_consent();

-- ── Lessons bucket: same video rule as 024's clips bucket (P6) ───────────────
DROP POLICY IF EXISTS "lessons_coach_insert" ON storage.objects;
CREATE POLICY "lessons_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lessons'
              AND (storage.foldername(name))[1] IN (SELECT public.rls_my_direct_player_ids_text())
              AND public.player_has_video_consent(public.clip_object_player_id(name)));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT coalesce(age_band, 'unknown') AS age_band,
       coalesce(age_band_source, '-') AS decided_by,
       public.player_has_video_consent(id) AS video_allowed,
       count(*) AS players
  FROM public.players
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
