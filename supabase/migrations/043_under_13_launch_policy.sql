-- ============================================================================
-- Migration 043: under-13 launch policy, enforced in the database
-- ============================================================================
-- Nolan's launch policy, server-side (the app enforces the same rules in
-- src/app/actions/invite.ts and src/app/actions/clips.ts):
--
-- 1. A coach can't add a player whose birth month/year makes them under 13.
--    The invite form collects birth month/year (required) and the server
--    refuses an under-13 date before writing anything (no player row, no
--    team link, no invite link, no email). The birth month/year are never
--    stored. This trigger is the second layer: a direct insert carrying an
--    under-13 COACH band is refused. INSERT-only on purpose: the coach's
--    under-13 answer on an EXISTING player (Edit Player, an UPDATE) still
--    freezes the account (037/040, the middleware gate), and the player's
--    own under-13 answer (age_band_self, written by recordOwnAgeAnswer,
--    createOwnPlayerRow and linkPlayerRow) is never refused here.
-- 2. No video for a player marked under 13. Clips were already blocked
--    (037's clips_require_video_consent trigger, the storage bucket
--    policies, and the server's checkUploadConsent). This migration adds the
--    same trigger for the lessons TABLE (the app's saveLessonRecord runs
--    with the service role, which bypasses RLS, so the table had no
--    database-level block). The lessons BUCKET needs no change: it has
--    insert/select/delete policies only, so direct UPDATEs are already
--    denied by RLS; the bucket INSERT policy already requires
--    player_has_video_consent (037 P6). Timestamp voice notes keep their
--    file-upload gate (getSignedUploadUrl) plus a new server row check in
--    saveTimestampNote.
--
-- Changes nothing already stored (no backfill, no deletes). Idempotent. One
-- transaction, then a read-only report.
--
-- Needs 025 (lessons table) and 037 (age bands, player_has_video_consent).
-- Applies on main with or without 042 (#57 merges first; 043 touches
-- nothing 042 creates).
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.player_has_video_consent(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'age_band_coach') THEN
    RAISE EXCEPTION 'Migration 043 needs migration 037 (age bands, player_has_video_consent) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'lessons') THEN
    RAISE EXCEPTION 'Migration 043 needs migration 025 (lessons table) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. No under-13 coach band on the way in ─────────────────────────────────
-- INSERT-only: fires before players_restrict_insert and players_set_age_band
-- (triggers fire in name order: refuse < restrict < set). Updates — Edit
-- Player, the freeze, linkPlayerRow, backfills — are untouched.
CREATE OR REPLACE FUNCTION public.players_refuse_under_13_coach_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.age_band_coach = 'under_13' THEN
    RAISE EXCEPTION 'Players under 13 can''t be added.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- No REVOKE here: like 037's clips_require_video_consent, this function must
-- keep its default EXECUTE so the trigger can fire on end-user writes too
-- (it reads only NEW, so it exposes nothing).

DROP TRIGGER IF EXISTS players_refuse_under_13_coach_insert ON public.players;
CREATE TRIGGER players_refuse_under_13_coach_insert
  BEFORE INSERT ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_refuse_under_13_coach_insert();

-- ── 2. No lessons rows for players without video consent ────────────────────
-- Mirrors clips_require_video_consent (037): same error text (code 42501) so
-- the app's isConsentPendingError classifies it, and failed saves stay
-- errors, never successes.
CREATE OR REPLACE FUNCTION public.lessons_require_video_consent()
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

DROP TRIGGER IF EXISTS lessons_require_video_consent ON public.lessons;
CREATE TRIGGER lessons_require_video_consent
  BEFORE INSERT OR UPDATE OF player_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.lessons_require_video_consent();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT coalesce(age_band_source, '-') AS decided_by,
       count(*) AS n
  FROM public.players
 WHERE age_band = 'under_13'
 GROUP BY 1
UNION ALL
SELECT 'clips for under-13 players', count(*)
  FROM public.clips
 WHERE player_id IN (SELECT id FROM public.players WHERE age_band = 'under_13')
UNION ALL
SELECT 'lessons for under-13 players', count(*)
  FROM public.lessons
 WHERE player_id IN (SELECT id FROM public.players WHERE age_band = 'under_13')
UNION ALL
SELECT 'guards in place (expect 2)', count(*)
  FROM pg_trigger
 WHERE NOT tgisinternal
   AND tgname IN ('players_refuse_under_13_coach_insert', 'lessons_require_video_consent')
 ORDER BY 1;
