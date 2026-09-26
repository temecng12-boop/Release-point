-- ============================================================================
-- Migration 015: player 18+ confirmation and clip consent check (RP-041)
-- ============================================================================
-- Consent status is stored on the players row:
--   * adult_confirmed_at / adult_confirmed_by: the player was confirmed 18+
--     (self-signup checkbox, the coach's add-player choice, or a coach later
--     marking the player 18+).
--   * consent_given_at (existing): guardian consent is on record.
--
-- A clip may be added for a player only if one of those is set. The app checks
-- this in src/lib/consent.ts / src/lib/consent-server.ts; the trigger below is
-- the database-side backstop. It fires for every role, including the service
-- role the app server uses, so it matches the server-side check.
--
-- Existing players get adult_confirmed_at = NULL. No data is backfilled: a coach
-- has to mark adult players 18+ (Edit Player, or "Mark as 18+" on the profile).
-- Existing clips are not touched; the trigger only checks new clips and clips
-- moved to another player.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.
-- ============================================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS adult_confirmed_at timestamptz;
ALTER TABLE players ADD COLUMN IF NOT EXISTS adult_confirmed_by uuid REFERENCES auth.users ON DELETE SET NULL;

COMMENT ON COLUMN players.adult_confirmed_at IS
  'When the player was confirmed to be 18 or older. NULL = not confirmed (guardian consent needed before video).';
COMMENT ON COLUMN players.adult_confirmed_by IS
  'User who confirmed the player is 18+ (the player at self-signup, or their coach).';

-- True if video may be added for this player.
CREATE OR REPLACE FUNCTION public.player_has_video_consent(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player_id
      AND (adult_confirmed_at IS NOT NULL OR consent_given_at IS NOT NULL)
  )
$$;

REVOKE ALL ON FUNCTION public.player_has_video_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_has_video_consent(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clips_require_video_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.player_has_video_consent(NEW.player_id) THEN
    RAISE EXCEPTION 'guardian consent for this player is still pending'
      USING ERRCODE = '42501',
            HINT = 'Set players.adult_confirmed_at (18+) or players.consent_given_at first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_require_video_consent ON clips;
CREATE TRIGGER clips_require_video_consent
  BEFORE INSERT OR UPDATE OF player_id ON clips
  FOR EACH ROW EXECUTE FUNCTION public.clips_require_video_consent();

NOTIFY pgrst, 'reload schema';
