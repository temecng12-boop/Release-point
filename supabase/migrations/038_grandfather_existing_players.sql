-- 038 = prod-sql-038-grandfather-existing-players.sql + prod-sql-038b-no-age-screen.sql, combined so the
-- repo matches prod. BOTH WERE ALREADY RUN ON PROD (Oct 5 2026): DO NOT PASTE THIS FILE OR EITHER PART AGAIN.
-- (Reference copy: prod-sql-038-combined.reference.sql, also DO NOT PASTE.)
-- Grandfather every existing player (Nolan, Oct 5 2026). Unblocks video, no banners or age screen.
-- Nolan's 18+ list -> 18_plus; anyone else already on the roster -> 13_17. Only touches rows with no band yet.
-- 038b: then mark every existing player as past the age screen, so nobody already on the app is prompted.
-- Safe to re-run (second run changes nothing). Ends with a read-only report.
BEGIN;
UPDATE public.players
   SET age_band_coach   = CASE WHEN full_name IN ('Lincoln George','Luca Staiano','New Test Player',
                                                  'Nolan George','Test Player','Caden Duke')
                               THEN '18_plus' ELSE '13_17' END,
       age_confirmed_at = now(),
       age_confirmed_by = coach_id,
       age_screen_at    = coalesce(age_screen_at, now())
 WHERE age_band IS NULL;
-- 038b
UPDATE public.players SET age_screen_at = now() WHERE age_screen_at IS NULL;
COMMIT;

SELECT full_name, age_band, age_band_source AS decided_by,
       public.player_has_video_consent(id) AS video_allowed,
       age_screen_at IS NOT NULL AS no_age_screen
  FROM public.players ORDER BY full_name;
