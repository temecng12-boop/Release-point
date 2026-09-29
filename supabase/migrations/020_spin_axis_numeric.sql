-- ============================================================================
-- Migration 020: store spin axis with half-degree precision (RP-045)
-- ============================================================================
-- pitch_metrics.spin_axis holds the axis in degrees clockwise from 12:00
-- (12:00 = 0°, 3:00 = 90°, 6:00 = 180°, 9:00 = 270°; 30° per hour, 0.5° per
-- minute). See src/lib/spin-axis.ts.
--
-- 001 created the column as integer, so any odd minute (every :15 and :45
-- tilt, e.g. 8:45 = 262.5°) can't be stored exactly: PostgREST rejects 262.5
-- for an integer column (22P02) and the imports round it (1:15 -> 38° ->
-- shown as 1:16). numeric keeps the exact value.
--
-- Widening integer -> numeric keeps every existing value unchanged. The ALTER
-- rewrites the table and takes a brief exclusive lock (the table is small).
-- Safe to re-run: skipped when the column is already numeric.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pitch_metrics'
      AND column_name  = 'spin_axis'
      AND data_type    = 'integer'
  ) THEN
    ALTER TABLE public.pitch_metrics ALTER COLUMN spin_axis TYPE numeric USING spin_axis::numeric;
  END IF;
END $$;

COMMENT ON COLUMN public.pitch_metrics.spin_axis IS
  'Spin axis / tilt in degrees clockwise from 12:00 (12:00 = 0, 3:00 = 90, 6:00 = 180). 30 degrees per hour, 0.5 per minute.';

NOTIFY pgrst, 'reload schema';
