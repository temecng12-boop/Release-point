-- 028: "Report a problem" (feedback_reports table + private screenshot bucket).
--
--   * public.feedback_reports: one row per report. Signed-in users may only
--     INSERT their own rows (user_id = auth.uid()). There are no SELECT,
--     UPDATE or DELETE policies, so only the service role (triage script)
--     reads them. The app inserts without reading the row back.
--   * A BEFORE INSERT trigger stamps id/created_at/email/role from the
--     database (not from the browser) and rate-limits: 5 reports per user per
--     10 minutes and 20 per day. Over the limit it raises SQLSTATE 'RP429'
--     (message 'feedback_rate_limited'), which the app shows as a friendly
--     "please wait" message.
--   * Storage bucket `feedback-screenshots`: PRIVATE, 10 MB, png/jpeg/webp/
--     heic/heif only. Signed-in users may upload only to
--     <their uid>/<report id>.<ext> (same 5/10 min, 20/day limit); nobody can
--     read, change or delete screenshots from the browser.
--
-- Rows go away with the user's auth account (ON DELETE CASCADE).
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS /
-- ON CONFLICT). One transaction: if anything fails, nothing is changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email              text,
  role               text,
  message            text NOT NULL,
  page_url           text,
  route              text,
  clip_id            uuid,
  user_agent         text,
  device             text,
  os                 text,
  browser            text,
  viewport_w         integer,
  viewport_h         integer,
  pixel_ratio        numeric(4,2),
  app_version        text,
  screenshot_path    text,
  screenshot_mime    text,
  screenshot_bytes   integer,
  screenshot_status  text NOT NULL DEFAULT 'none',
  status             text NOT NULL DEFAULT 'new'
);

-- Constraints (added separately so a re-run on an older shape still applies them).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_message_len') THEN
    ALTER TABLE public.feedback_reports ADD CONSTRAINT feedback_reports_message_len
      CHECK (char_length(message) <= 4000 AND btrim(message) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_field_lens') THEN
    ALTER TABLE public.feedback_reports ADD CONSTRAINT feedback_reports_field_lens CHECK (
      coalesce(char_length(page_url), 0) <= 2048 AND coalesce(char_length(route), 0) <= 300
      AND coalesce(char_length(user_agent), 0) <= 1024 AND coalesce(char_length(device), 0) <= 100
      AND coalesce(char_length(os), 0) <= 100 AND coalesce(char_length(browser), 0) <= 100
      AND coalesce(char_length(app_version), 0) <= 100 AND coalesce(char_length(screenshot_mime), 0) <= 50
      AND coalesce(viewport_w, 0) BETWEEN 0 AND 20000 AND coalesce(viewport_h, 0) BETWEEN 0 AND 20000
      AND coalesce(screenshot_bytes, 0) BETWEEN 0 AND 10485760);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_screenshot') THEN
    ALTER TABLE public.feedback_reports ADD CONSTRAINT feedback_reports_screenshot CHECK (
      screenshot_status IN ('none', 'attached', 'failed')
      AND (screenshot_path IS NULL
           OR screenshot_path ~ ('^' || user_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp|heic|heif)$')));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS feedback_reports_created_at_idx ON public.feedback_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_user_created_idx ON public.feedback_reports (user_id, created_at DESC);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- Insert only; no read-back from the browser.
REVOKE ALL ON public.feedback_reports FROM anon, authenticated;
GRANT INSERT ON public.feedback_reports TO authenticated;
GRANT ALL ON public.feedback_reports TO service_role;

DROP POLICY IF EXISTS "feedback_reports_insert_own" ON public.feedback_reports;
CREATE POLICY "feedback_reports_insert_own" ON public.feedback_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Rate limit + server-side stamps. SECURITY DEFINER so it can count the
-- caller's earlier reports (they have no SELECT) and read their email/role.
CREATE OR REPLACE FUNCTION public.feedback_reports_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_10m int;
  v_day int;
BEGIN
  -- Browser (JWT) inserts: PostgREST runs them under SET ROLE authenticated.
  -- current_user is this function's owner here (SECURITY DEFINER), so the
  -- role setting is what tells them apart from the service role.
  IF coalesce(current_setting('role', true), '') IN ('authenticated', 'anon') THEN
    -- One report at a time per user, so parallel requests can't slip past.
    PERFORM pg_advisory_xact_lock(hashtext('feedback_reports:' || NEW.user_id::text));
    SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'),
           count(*)
      INTO v_10m, v_day
      FROM public.feedback_reports
     WHERE user_id = NEW.user_id
       AND created_at > now() - interval '1 day';
    IF v_10m >= 5 OR v_day >= 20 THEN
      RAISE EXCEPTION 'feedback_rate_limited'
        USING ERRCODE = 'RP429',
              HINT = 'At most 5 reports per 10 minutes and 20 per day.';
    END IF;
    NEW.created_at := now();
    NEW.status := 'new';
  END IF;
  NEW.email := (SELECT u.email FROM auth.users u WHERE u.id = NEW.user_id);
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'SELECT role::text FROM public.profiles WHERE id = $1' INTO NEW.role USING NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.feedback_reports_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS feedback_reports_before_insert ON public.feedback_reports;
CREATE TRIGGER feedback_reports_before_insert
  BEFORE INSERT ON public.feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.feedback_reports_before_insert();

-- ── Screenshot bucket (private) ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-screenshots', 'feedback-screenshots', false, 10485760,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- True if the caller may upload another screenshot (same limits as reports).
CREATE OR REPLACE FUNCTION public.feedback_screenshot_upload_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FILTER (WHERE o.created_at > now() - interval '10 minutes') < 5
     AND count(*) < 20
    FROM storage.objects o
   WHERE o.bucket_id = 'feedback-screenshots'
     AND o.name LIKE auth.uid()::text || '/%'
     AND o.created_at > now() - interval '1 day'
$$;
REVOKE ALL ON FUNCTION public.feedback_screenshot_upload_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feedback_screenshot_upload_allowed() TO authenticated;

DROP POLICY IF EXISTS "feedback_screenshots_insert_own" ON storage.objects;
CREATE POLICY "feedback_screenshots_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND auth.uid() IS NOT NULL
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpg|webp|heic|heif)$')
    AND public.feedback_screenshot_upload_allowed()
  );
-- No SELECT / UPDATE / DELETE policies for this bucket: only the service role
-- (triage script) reads screenshots.

COMMIT;

NOTIFY pgrst, 'reload schema';
