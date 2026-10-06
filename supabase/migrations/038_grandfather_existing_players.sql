-- Grandfather every existing player (Nolan, Oct 5 2026). Unblocks video, no banners or age screen.
-- Nolan's 18+ list -> 18_plus; anyone else already on the roster -> 13_17. Only touches rows with no band yet.
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
COMMIT;

SELECT full_name, age_band, age_band_source AS decided_by,
       public.player_has_video_consent(id) AS video_allowed,
       age_screen_at IS NOT NULL AS no_age_screen
  FROM public.players ORDER BY full_name;
