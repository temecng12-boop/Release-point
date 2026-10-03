-- ============================================================================
-- PR A (#44) / migration 037: which coaches' players lose video when 037 lands
-- ============================================================================
-- READ-ONLY: one SELECT, changes nothing. Run in the Supabase SQL editor
-- BEFORE applying 037 (it reads 023's columns; 037's columns aren't needed).
-- No player names or emails: counts per coach, plus the coach's id and email
-- so you know whom to message.
--
-- Today (023): video if adult_confirmed_at OR consent_given_at is set.
-- After 037:   video only for a confirmed 13-17 or 18+ band. 037's backfill
--              turns adult_confirmed_at into an 18+ answer; an under-13 age
--              range ("10-12", "12U", "U12") on the player or any of their
--              teams makes the band under 13. consent_given_at alone (the old
--              one-click guardian consent) no longer counts.
--
-- Columns:
--   lose_old_consent_only   have video today only via the old guardian consent
--   lose_18plus_u13_group   marked 18+ but on an under-13 age range: under 13
--   lose_video_total        sum of the two (these lose access on deploy)
--   no_band_already_blocked no video today either; the coach must pick an age
--   no_band_youth_or_u13    players with no band after 037 (old consent only
--                           or already blocked) on "Youth" or an under-13
--                           range: they show as under 13 until they or the
--                           coach answer
--   keep_video              18+ confirmations that keep video
-- ============================================================================
WITH p AS (
  SELECT pl.id, pl.coach_id, pl.adult_confirmed_at, pl.consent_given_at,
         array_remove(ARRAY[pl.age_group] || coalesce((
           SELECT array_agg(t.age_group) FROM public.teams t
            WHERE t.id = pl.team_id
               OR t.id IN (SELECT pt.team_id FROM public.player_teams pt WHERE pt.player_id = pl.id)
         ), ARRAY[]::text[]), NULL) AS groups
    FROM public.players pl
),
f AS (
  SELECT p.*,
         EXISTS (SELECT 1 FROM unnest(p.groups) g(x) WHERE
                   coalesce((regexp_match(lower(x), '(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})'))[2]::int, 99) <= 12
                OR coalesce((regexp_match(lower(x), '(?:^|[^a-z0-9])(?:u|under)\s*-?\s*(\d{1,2})(?:[^0-9]|$)'))[1]::int, 99) <= 12
                OR coalesce((regexp_match(lower(x), '(?:^|[^0-9])(\d{1,2})\s*-?\s*u(?:[^a-z]|$)'))[1]::int, 99) <= 12) AS u13_range,
         EXISTS (SELECT 1 FROM unnest(p.groups) g(x) WHERE lower(x) ~ '(^|[^a-z])youth([^a-z]|$)' AND lower(x) !~ '[0-9]') AS youth
    FROM p
)
SELECT f.coach_id,
       (SELECT u.email FROM auth.users u WHERE u.id = f.coach_id)                                        AS coach_email,
       count(*) FILTER (WHERE f.consent_given_at IS NOT NULL AND f.adult_confirmed_at IS NULL)           AS lose_old_consent_only,
       count(*) FILTER (WHERE f.adult_confirmed_at IS NOT NULL AND f.u13_range)                          AS lose_18plus_u13_group,
       count(*) FILTER (WHERE (f.consent_given_at IS NOT NULL AND f.adult_confirmed_at IS NULL)
                           OR (f.adult_confirmed_at IS NOT NULL AND f.u13_range))                        AS lose_video_total,
       count(*) FILTER (WHERE f.consent_given_at IS NULL AND f.adult_confirmed_at IS NULL)               AS no_band_already_blocked,
       count(*) FILTER (WHERE f.adult_confirmed_at IS NULL AND (f.u13_range OR f.youth))                 AS no_band_youth_or_u13,
       count(*) FILTER (WHERE f.adult_confirmed_at IS NOT NULL AND NOT f.u13_range)                      AS keep_video,
       count(*)                                                                                          AS players
  FROM f
 GROUP BY f.coach_id
 ORDER BY lose_video_total DESC, no_band_already_blocked DESC, coach_email NULLS LAST;
