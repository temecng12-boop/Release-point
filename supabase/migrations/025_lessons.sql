-- 025_lessons: lesson history. One row per coach lesson recording; clips.lesson_path
-- stays (newest lesson) for older app code. Needs 018 (team_coaches, rls_ helpers)
-- and 019 (clips.lesson_path); does not depend on 021-024. One transaction, safe to re-run.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_coaches') IS NULL
     OR to_regprocedure('public.rls_my_coached_player_ids()') IS NULL THEN
    RAISE EXCEPTION '025_lessons: run migration 018_team_coaches first (team_coaches / rls_my_coached_player_ids missing)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'clips' AND column_name = 'lesson_path') THEN
    RAISE EXCEPTION '025_lessons: run migration 019_schema_drift_catchup first (clips.lesson_path missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lessons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id        uuid NOT NULL REFERENCES public.clips(id)   ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  coach_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  media_path     text NOT NULL,
  mime           text,
  duration_ms    integer,
  timeline       jsonb,
  format_version integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_media_path_key       ON public.lessons (media_path);
CREATE INDEX        IF NOT EXISTS lessons_player_created_idx   ON public.lessons (player_id, created_at DESC);
CREATE INDEX        IF NOT EXISTS lessons_clip_idx             ON public.lessons (clip_id);

-- Players the signed-in user may view: coached (direct or team, 018 helper), own
-- player row, or linked guardian. Same definition as the prod run-list's 3b step.
CREATE OR REPLACE FUNCTION public.rls_my_viewable_player_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.rls_my_coached_player_ids()
  UNION
  SELECT p.id FROM public.players p WHERE p.user_id = auth.uid()
  UNION
  SELECT p.id FROM public.players p
  WHERE p.guardian_id IN (SELECT g.id FROM public.guardians g WHERE g.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.rls_my_viewable_player_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_my_viewable_player_ids() TO authenticated;

-- Read-only for signed-in viewers; the app writes with the service role.
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lessons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
DROP POLICY IF EXISTS "lessons_select_viewable" ON public.lessons;
CREATE POLICY "lessons_select_viewable" ON public.lessons
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT public.rls_my_viewable_player_ids()));

-- Backfill: one row per clip that already has a lesson (recorder unknown -> NULL).
INSERT INTO public.lessons (clip_id, player_id, coach_id, media_path, mime, created_at)
SELECT c.id, c.player_id, NULL, c.lesson_path,
       CASE WHEN c.lesson_path ILIKE '%.mp4' THEN 'video/mp4' ELSE 'video/webm' END,
       COALESCE((SELECT o.created_at FROM storage.objects o
                 WHERE o.bucket_id = 'lessons' AND o.name = c.lesson_path LIMIT 1), c.created_at, now())
FROM public.clips c
WHERE c.lesson_path IS NOT NULL
ON CONFLICT (media_path) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Preview: clips with a lesson vs lessons rows (backfilled should equal clips_with_lesson).
SELECT (SELECT count(*) FROM public.clips WHERE lesson_path IS NOT NULL) AS clips_with_lesson,
       (SELECT count(*) FROM public.lessons)                            AS lessons_rows,
       (SELECT count(*) FROM public.clips c WHERE c.lesson_path IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.media_path = c.lesson_path)) AS missing_backfill;

-- Check: expect every column true.
SELECT to_regclass('public.lessons') IS NOT NULL                                            AS table_ok,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lessons'::regclass)         AS rls_on,
       EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lessons' AND policyname = 'lessons_select_viewable') AS policy_ok,
       NOT has_table_privilege('anon', 'public.lessons', 'SELECT')                          AS anon_no_read,
       NOT (has_table_privilege('authenticated', 'public.lessons', 'INSERT')
         OR has_table_privilege('authenticated', 'public.lessons', 'UPDATE')
         OR has_table_privilege('authenticated', 'public.lessons', 'DELETE'))               AS no_client_writes;
