-- ============================================================================
-- Migration 019: add columns the app code uses but no migration creates
-- (RP-042)
-- ============================================================================
-- Migrations 001-018 never create these, but the code reads or writes them:
--   * clips.lesson_path         text     saveLessonPath(), deleteLessonPath(),
--                                        clip page (lesson recordings, 016)
--   * clips.reframe             jsonb    saveReframe(), clip page
--   * pitch_metrics.extension   numeric  addPitchMetric(), metrics tab
--   * pitch_metrics.vaa         numeric  addPitchMetric(), metrics tab
--   * players.showcases         jsonb    player settings / profile
--   * players.career_stats      jsonb    player settings / profile
--   * timestamp_notes.drawing_data jsonb 014_timestamp_drawing.sql already adds
--                                        it; repeated here with IF NOT EXISTS so
--                                        this file alone fixes RP-042 ("Could
--                                        not find the 'drawing_data' column of
--                                        'timestamp_notes' in the schema cache").
--
-- Some of these may already exist in production (added in the dashboard).
-- Everything is IF NOT EXISTS and only adds nullable columns: safe to re-run,
-- no existing data is changed.
-- ============================================================================

ALTER TABLE public.timestamp_notes ADD COLUMN IF NOT EXISTS drawing_data jsonb;

ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS lesson_path text;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS reframe     jsonb;

ALTER TABLE public.pitch_metrics ADD COLUMN IF NOT EXISTS extension numeric;
ALTER TABLE public.pitch_metrics ADD COLUMN IF NOT EXISTS vaa       numeric;

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS showcases    jsonb;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS career_stats jsonb;

-- Reload PostgREST's schema cache so the new columns are visible right away.
NOTIFY pgrst, 'reload schema';
