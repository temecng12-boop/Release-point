-- ============================================================================
-- Migration 044: multi-value player positions + per-clip pitching/hitting
-- ============================================================================
-- Positions are a multi-select of six tags (Pitcher, Hitter, Catcher, Infield,
-- Outfield, Two-way). This migration:
--
-- 1. Adds players.positions text[] NOT NULL DEFAULT '{}', with a CHECK that
--    every element is one of those six. The old players.position column
--    (pitcher | hitter) is KEPT so a deploy-before-paste or paste-before-deploy
--    still works: the app dual-writes both and reads positions when present,
--    falling back to the old column when it is missing or null.
-- 2. Backfills positions from the old column, mapping every value the app has
--    written (pitcher, hitter) plus two-way spellings testers used
--    (pitcher+hitter, two-way, two_way, …) and the new tags if they already
--    appear. Rows whose old value is empty stay '{}'. Re-running is a no-op
--    for rows that already have positions set.
-- 3. Adds clips.clip_kind text CHECK (pitching | hitting), nullable. Null
--    means "use the default from the player's positions" (hitter-only →
--    hitting; otherwise pitching). The coach or player can change it; it is
--    never locked.
--
-- RLS: no new policies. Coaches already UPDATE their players rows (same as
-- position); the 021 restrict_update trigger lets coaches change any
-- non-restricted column, so positions is allowed for them and refused for
-- guardians (consent only) and claiming players (user_id / accepted_at only).
-- Players have no JWT UPDATE on their own row except claim. clip_kind rides
-- on clips_direct_coach_update for coaches; the app writes it with the
-- service role after an access check so the player can change it too.
-- New columns inherit the existing table grants (no extra GRANT/REVOKE).
--
-- Idempotent. One transaction, then NOTIFY pgrst and a read-only report.
-- Needs 001 (players.position, clips) and 043 (under-13 launch, so this
-- applies after the current main tip).
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'position')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'clips') THEN
    RAISE EXCEPTION 'Migration 044 needs migration 001 (players.position, clips) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure('public.lessons_require_video_consent()') IS NULL THEN
    RAISE EXCEPTION 'Migration 044 needs migration 043 (under-13 launch) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. players.positions ─────────────────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS positions text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'players_positions_allowed'
       AND conrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_positions_allowed
      CHECK (positions <@ ARRAY['pitcher','hitter','catcher','infield','outfield','two-way']::text[]);
  END IF;
END
$$;

COMMENT ON COLUMN public.players.positions IS
  'Multi-select position tags. Empty is valid. Old players.position is kept for dual-write.';

-- Backfill from the old column. Only rows that still have an empty array, so
-- a second run does not overwrite a later chip save. Unknown leftovers stay
-- '{}' and show up in the report as "old value but empty positions".
UPDATE public.players
   SET positions = CASE
     WHEN lower(btrim(position)) IN ('pitcher', 'p', 'rhp', 'lhp', 'sp', 'rp', 'cp')
       THEN ARRAY['pitcher']::text[]
     WHEN lower(btrim(position)) IN ('hitter')
       THEN ARRAY['hitter']::text[]
     WHEN lower(btrim(position)) IN (
       'pitcher+hitter', 'pitcher + hitter', 'hitter+pitcher', 'hitter + pitcher',
       'two-way', 'two_way', 'twoway', 'both'
     ) THEN ARRAY['two-way']::text[]
     WHEN lower(btrim(position)) IN ('catcher', 'c')
       THEN ARRAY['catcher']::text[]
     WHEN lower(btrim(position)) IN ('infield', 'infielder', 'inf')
       THEN ARRAY['infield']::text[]
     WHEN lower(btrim(position)) IN ('outfield', 'outfielder', 'of')
       THEN ARRAY['outfield']::text[]
     WHEN lower(btrim(position)) LIKE '%pitcher%' AND lower(btrim(position)) LIKE '%hitter%'
       THEN ARRAY['two-way']::text[]
     WHEN lower(btrim(position)) LIKE '%pitcher%'
       THEN ARRAY['pitcher']::text[]
     WHEN lower(btrim(position)) LIKE '%hitter%' OR lower(btrim(position)) LIKE '%batter%'
       THEN ARRAY['hitter']::text[]
     WHEN lower(btrim(position)) LIKE '%catch%'
       THEN ARRAY['catcher']::text[]
     WHEN lower(btrim(position)) LIKE '%infield%'
       THEN ARRAY['infield']::text[]
     WHEN lower(btrim(position)) LIKE '%outfield%'
       THEN ARRAY['outfield']::text[]
     WHEN lower(btrim(position)) LIKE '%two%' AND lower(btrim(position)) LIKE '%way%'
       THEN ARRAY['two-way']::text[]
     ELSE '{}'::text[]
   END
 WHERE (positions IS NULL OR positions = '{}')
   AND position IS NOT NULL
   AND btrim(position) <> '';

-- ── 2. clips.clip_kind ───────────────────────────────────────────────────────
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS clip_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'clips_clip_kind_allowed'
       AND conrelid = 'public.clips'::regclass
  ) THEN
    ALTER TABLE public.clips
      ADD CONSTRAINT clips_clip_kind_allowed
      CHECK (clip_kind IS NULL OR clip_kind IN ('pitching', 'hitting'));
  END IF;
END
$$;

COMMENT ON COLUMN public.clips.clip_kind IS
  'Per-clip pitching/hitting toggle. Null uses the default from the player''s positions.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT 'pitcher' AS item, count(*) AS n FROM public.players WHERE 'pitcher' = ANY(positions)
UNION ALL
SELECT 'hitter', count(*) FROM public.players WHERE 'hitter' = ANY(positions)
UNION ALL
SELECT 'catcher', count(*) FROM public.players WHERE 'catcher' = ANY(positions)
UNION ALL
SELECT 'infield', count(*) FROM public.players WHERE 'infield' = ANY(positions)
UNION ALL
SELECT 'outfield', count(*) FROM public.players WHERE 'outfield' = ANY(positions)
UNION ALL
SELECT 'two-way', count(*) FROM public.players WHERE 'two-way' = ANY(positions)
UNION ALL
SELECT 'old value but empty positions (expect 0)', count(*)
  FROM public.players
 WHERE position IS NOT NULL AND btrim(position) <> '' AND (positions IS NULL OR positions = '{}')
UNION ALL
SELECT 'clip_kind pitching', count(*) FROM public.clips WHERE clip_kind = 'pitching'
UNION ALL
SELECT 'clip_kind hitting', count(*) FROM public.clips WHERE clip_kind = 'hitting'
UNION ALL
SELECT 'clip_kind unset (null)', count(*) FROM public.clips WHERE clip_kind IS NULL
ORDER BY 1;
