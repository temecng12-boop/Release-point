-- ============================================================================
-- Migration 035: player age bands, and the video consent rule by band
-- ============================================================================
-- A guardian's consent is needed ONLY for players under 13. Each player gets
-- an age band:
--   * players.age_band          'under_13' | '13_17' | '18_plus', NULL = unknown
--   * players.age_confirmed_at  when the band was confirmed (required with a band)
--   * players.age_confirmed_by  who confirmed it (the player's coach, or the
--                               player at self-signup / their one-time confirm)
--   * players.guardian_invite_sent_at  last guardian consent email (the app
--                               allows one per player every 10 minutes)
--   * profiles.tos_accepted_at  when the account accepted the Terms (signup).
--     On profiles because Terms are accepted per account (coaches too), and
--     invited players rows have no account yet. Age lives on players because
--     the clips trigger, the roster and invited (account-less) players all
--     work on players rows.
-- 023's adult_confirmed_at / adult_confirmed_by stay, and the app keeps them
-- in step: '18_plus' sets them, any other band clears them.
--
-- Video rule (public.player_has_video_consent, used by the clips trigger and
-- 024's storage policies). Video may be added when ANY of:
--   1. consent_given_at IS NOT NULL (guardian consent covers every band);
--   2. age_band IN ('13_17', '18_plus') AND age_confirmed_at IS NOT NULL;
--   3. age_band IS NULL AND adult_confirmed_at IS NOT NULL (18+ from before
--      035; the backfill below turns these into '18_plus').
-- Blocked otherwise: 'under_13' without consent (even if adult_confirmed_at
-- is somehow set), and an unknown band (NULL) with no 18+ confirmation and no
-- consent, until a coach picks a band or a coachless player confirms theirs.
-- src/lib/consent.ts implements the same rule for the app.
-- The trigger fires for every role, including the service role the app uses.
--
-- Backfill (one time, safe to re-run; only rows with age_band IS NULL):
--   * adult_confirmed_at set -> '18_plus', confirmed at/by the same values.
--   * consent_given_at holders without an 18+ confirmation keep age_band NULL
--     (nothing stored says which band they are in) and stay allowed by rule 1.
-- Existing clips are not touched; the trigger checks new clips and clips moved
-- to another player.
--
-- Who may write the new columns through the API: 021's players_restrict_update
-- lets only the player's coach change roster fields (players can't change
-- their own band; guardians only consent_given_at). The app writes them with
-- the service role after its own authorization checks. No RLS changes.
--
-- Needs 021 and 023. Idempotent: ADD COLUMN IF NOT EXISTS, guarded constraints,
-- CREATE OR REPLACE, DROP ... IF EXISTS. One transaction.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'adult_confirmed_at')
     OR to_regprocedure('public.player_has_video_consent(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration 035 needs migration 023 (players.adult_confirmed_at, player_has_video_consent) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.players_restrict_update()') IS NULL THEN
    RAISE EXCEPTION 'Migration 035 needs migration 021 (players_restrict_update) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_band text;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS age_confirmed_by uuid REFERENCES auth.users ON DELETE SET NULL;
ALTER TABLE public.players  ADD COLUMN IF NOT EXISTS guardian_invite_sent_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.players'::regclass AND conname = 'players_age_band_check') THEN
    ALTER TABLE public.players ADD CONSTRAINT players_age_band_check
      CHECK (age_band IS NULL OR age_band IN ('under_13', '13_17', '18_plus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.players'::regclass AND conname = 'players_age_band_confirmed_check') THEN
    ALTER TABLE public.players ADD CONSTRAINT players_age_band_confirmed_check
      CHECK (age_band IS NULL OR age_confirmed_at IS NOT NULL);
  END IF;
END
$$;

COMMENT ON COLUMN public.players.age_band IS
  'under_13 | 13_17 | 18_plus; NULL = unknown (no video until confirmed). Only under_13 needs guardian consent.';
COMMENT ON COLUMN public.players.age_confirmed_at IS 'When age_band was confirmed (set together with age_band).';
COMMENT ON COLUMN public.players.age_confirmed_by IS 'Who confirmed age_band: the player''s coach, or the player themself.';
COMMENT ON COLUMN public.players.guardian_invite_sent_at IS 'Last guardian consent email for this player (app rate limit).';
COMMENT ON COLUMN public.profiles.tos_accepted_at IS 'When this account accepted the Terms of Service at signup.';

-- One-time backfill: 18+ confirmations become the 18_plus band.
UPDATE public.players
   SET age_band = '18_plus',
       age_confirmed_at = adult_confirmed_at,
       age_confirmed_by = adult_confirmed_by
 WHERE age_band IS NULL
   AND adult_confirmed_at IS NOT NULL;

-- True if video may be added for this player (rules 1-3 above).
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
      AND (
            consent_given_at IS NOT NULL
         OR (age_band IN ('13_17', '18_plus') AND age_confirmed_at IS NOT NULL)
         OR (age_band IS NULL AND adult_confirmed_at IS NOT NULL)
      )
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
            HINT = 'Confirm the player''s age band (13_17 or 18_plus), or for under_13 record guardian consent (players.consent_given_at).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_require_video_consent ON public.clips;
CREATE TRIGGER clips_require_video_consent
  BEFORE INSERT OR UPDATE OF player_id ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.clips_require_video_consent();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
-- Players by band and whether video can be added for them.
SELECT coalesce(age_band, 'unknown') AS age_band,
       public.player_has_video_consent(id) AS video_allowed,
       count(*) AS players
  FROM public.players
 GROUP BY 1, 2
 ORDER BY 1, 2;
