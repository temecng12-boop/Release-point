-- ============================================================================
-- Migration 045: rate_limit_log + waitlist extras + clip columns prod is missing
-- ============================================================================
-- Nolan's Oct 8 pushes reference:
--   * public.rate_limit_log (per-user API rate limits; service-role only)
--   * waitlist.role, program_name, athlete_count, tech_stack, referral,
--     approved_at, invite_sent_at (admin waitlist + richer signup form)
--   * clips.hitting_metrics (017 exists in git; prod was never pasted)
--   * clips.featured_youtube_id, featured_comparison_note (pinned compare)
--
-- No deletes. RLS enabled. Anon/authenticated get no access to rate_limit_log.
-- Idempotent. One transaction, then NOTIFY pgrst and a read-only report.
-- Needs 015 (waitlist) and 001 (clips).
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    RAISE EXCEPTION 'Migration 045 needs migration 015 (waitlist) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'clips') THEN
    RAISE EXCEPTION 'Migration 045 needs migration 001 (clips) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. rate_limit_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  route      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'rate_limit_log_route_len'
       AND conrelid = 'public.rate_limit_log'::regclass
  ) THEN
    ALTER TABLE public.rate_limit_log
      ADD CONSTRAINT rate_limit_log_route_len
      CHECK (char_length(route) BETWEEN 1 AND 80);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS rate_limit_log_user_route_created_idx
  ON public.rate_limit_log (user_id, route, created_at DESC);

COMMENT ON TABLE public.rate_limit_log IS
  'Per-user API rate-limit hits. Written and read only by the service role.';

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_log TO service_role;

-- ── 2. waitlist extras ───────────────────────────────────────────────────────
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS program_name text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS athlete_count text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS tech_stack text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS referral text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;

-- ── 3. clip columns (prod is missing hitting_metrics even though 017 exists) ─
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS hitting_metrics jsonb;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS featured_youtube_id text;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS featured_comparison_note text;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT 'rate_limit_log rows' AS item, count(*)::bigint AS n FROM public.rate_limit_log
UNION ALL
SELECT 'waitlist with extras', count(*) FROM public.waitlist WHERE role IS NOT NULL OR program_name IS NOT NULL
UNION ALL
SELECT 'waitlist approved', count(*) FROM public.waitlist WHERE approved_at IS NOT NULL
UNION ALL
SELECT 'clips with hitting_metrics', count(*) FROM public.clips WHERE hitting_metrics IS NOT NULL
UNION ALL
SELECT 'clips with pinned compare', count(*) FROM public.clips WHERE featured_youtube_id IS NOT NULL
ORDER BY 1;
