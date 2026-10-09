-- ============================================================================
-- Migration 046: roster-only players, assistant coach write, minor consent
-- ============================================================================
-- 1. players.email stays nullable (DROP NOT NULL only if a NOT NULL slipped
--    in). Roster-only rows have user_id NULL and email NULL until a coach
--    attaches one. A partial unique index on normalized email (where email
--    is not null) is added only when there are no duplicates; duplicates
--    are reported, not failed.
-- 2. public.player_video_consents: append-only history of coach-recorded
--    permission for roster-only 13–17 players
--    (coach_is_guardian | coach_has_written_permission). RLS on; no anon
--    access; writes only through the service role / server action.
-- 3. public.player_has_video_consent: account players keep the 037 rule
--    (age_band in 13_17/18_plus AND age_confirmed_at). Roster-only
--    (user_id IS NULL): coach band 18_plus, or 13_17 with a consent row.
--    under_13 is never true. Same SECURITY DEFINER / search_path pattern.
-- 4. Team coaches (including assistants) get write on their team's players:
--    clips, annotations, timestamp_notes, pitch_metrics, clips + lessons
--    storage. Head-coach-only stays owner-only: teams, team_coaches,
--    deleting a player (app check on players.coach_id).
-- 5. 043's players_refuse_under_13_coach_insert and
--    lessons_require_video_consent are left in place.
--
-- Needs 043, 044 and 045. Idempotent. No deletes. One transaction, then
-- NOTIFY pgrst and a read-only report. Safe to paste before the app deploys:
-- existing invite inserts (coach_id, full_name, email, no band) still work.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'players_refuse_under_13_coach_insert')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lessons_require_video_consent') THEN
    RAISE EXCEPTION 'Migration 046 needs migration 043 (under-13 launch policy) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'positions') THEN
    RAISE EXCEPTION 'Migration 046 needs migration 044 (player positions) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('public.rate_limit_log') IS NULL THEN
    RAISE EXCEPTION 'Migration 046 needs migration 045 (rate_limit_log) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. players.email nullable ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'players'
       AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.players ALTER COLUMN email DROP NOT NULL;
  END IF;
END
$$;

-- Partial unique index on normalized email. Skip (and report) if duplicates.
DO $$
DECLARE
  dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email))
      FROM public.players
     WHERE email IS NOT NULL
     GROUP BY 1
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE NOTICE '046: % duplicate normalized players.email value(s); unique index not created. Clean up by hand.', dupes;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'players_email_normalized_unique'
    ) THEN
      EXECUTE $sql$
        CREATE UNIQUE INDEX players_email_normalized_unique
          ON public.players (lower(btrim(email)))
          WHERE email IS NOT NULL
      $sql$;
    END IF;
  END IF;
END
$$;

-- ── 2. Consent history (append-only, like terms_acceptances) ─────────────────
CREATE TABLE IF NOT EXISTS public.player_video_consents (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  kind              text        NOT NULL,
  consent_given_at  timestamptz NOT NULL DEFAULT now(),
  consent_given_by  uuid        NOT NULL REFERENCES auth.users(id),
  guardian_coach_id uuid        REFERENCES auth.users(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'player_video_consents_kind_check'
       AND conrelid = 'public.player_video_consents'::regclass
  ) THEN
    ALTER TABLE public.player_video_consents
      ADD CONSTRAINT player_video_consents_kind_check
      CHECK (kind IN ('coach_is_guardian', 'coach_has_written_permission'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS player_video_consents_player_id_idx
  ON public.player_video_consents (player_id);

COMMENT ON TABLE public.player_video_consents IS
  'Append-only coach-recorded video permission for roster-only 13–17 players. Written by the app (service role) only.';

ALTER TABLE public.player_video_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_video_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_video_consents TO authenticated;
GRANT ALL ON public.player_video_consents TO service_role;

DROP POLICY IF EXISTS "player_video_consents_select_coach" ON public.player_video_consents;
CREATE POLICY "player_video_consents_select_coach" ON public.player_video_consents
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT public.rls_my_coached_player_ids()));

CREATE OR REPLACE FUNCTION public.player_video_consents_no_user_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    RAISE EXCEPTION 'player_video_consents is written by the app only' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_video_consents_no_user_writes ON public.player_video_consents;
CREATE TRIGGER player_video_consents_no_user_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.player_video_consents
  FOR EACH ROW EXECUTE FUNCTION public.player_video_consents_no_user_writes();

-- ── 3. Video rule: account players unchanged; roster-only coach band + consent
CREATE OR REPLACE FUNCTION public.player_has_video_consent(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
     WHERE p.id = p_player_id
       AND (
         (p.user_id IS NOT NULL
          AND p.age_band IN ('13_17', '18_plus')
          AND p.age_confirmed_at IS NOT NULL)
         OR
         (p.user_id IS NULL
          AND p.age_band_coach = '18_plus')
         OR
         (p.user_id IS NULL
          AND p.age_band_coach = '13_17'
          AND EXISTS (
            SELECT 1 FROM public.player_video_consents c
             WHERE c.player_id = p.id
          ))
       )
  )
$$;

REVOKE ALL ON FUNCTION public.player_has_video_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_has_video_consent(uuid) TO authenticated, service_role;

-- ── 4. Team-coach write (clips, notes, metrics, storage) ─────────────────────
DROP POLICY IF EXISTS "clips_direct_coach_insert" ON public.clips;
DROP POLICY IF EXISTS "clips_coach_insert"        ON public.clips;
CREATE POLICY "clips_coach_insert" ON public.clips
  FOR INSERT TO authenticated
  WITH CHECK (player_id IN (SELECT public.rls_my_coached_player_ids()));

DROP POLICY IF EXISTS "clips_direct_coach_update" ON public.clips;
DROP POLICY IF EXISTS "clips_coach_update"        ON public.clips;
CREATE POLICY "clips_coach_update" ON public.clips
  FOR UPDATE TO authenticated
  USING      (player_id IN (SELECT public.rls_my_coached_player_ids()))
  WITH CHECK (player_id IN (SELECT public.rls_my_coached_player_ids()));

DROP POLICY IF EXISTS "clips_direct_coach_delete" ON public.clips;
DROP POLICY IF EXISTS "clips_coach_delete"        ON public.clips;
CREATE POLICY "clips_coach_delete" ON public.clips
  FOR DELETE TO authenticated
  USING (player_id IN (SELECT public.rls_my_coached_player_ids()));

DROP POLICY IF EXISTS "annotations_team_coach_all" ON public.annotations;
CREATE POLICY "annotations_team_coach_all" ON public.annotations
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  );

DROP POLICY IF EXISTS "timestamp_notes_team_coach_all" ON public.timestamp_notes;
CREATE POLICY "timestamp_notes_team_coach_all" ON public.timestamp_notes
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  );

DROP POLICY IF EXISTS "pitch_metrics_team_coach_all" ON public.pitch_metrics;
CREATE POLICY "pitch_metrics_team_coach_all" ON public.pitch_metrics
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM public.clips c
       WHERE c.player_id IN (SELECT public.rls_my_coached_player_ids())
    )
  );

-- Clips bucket: team coaches may insert/update/delete under a team player's folder.
DROP POLICY IF EXISTS "clips_bucket_insert" ON storage.objects;
CREATE POLICY "clips_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clips'
    AND public.clip_object_player_id(name) IS NOT NULL
    AND public.player_has_video_consent(public.clip_object_player_id(name))
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR public.rls_is_players_team_coach(public.clip_object_player_id(name))
      OR (
        public.rls_is_player_self(public.clip_object_player_id(name))
        AND public.clip_object_is_top_level(name)
      )
    )
  );

DROP POLICY IF EXISTS "clips_bucket_update" ON storage.objects;
CREATE POLICY "clips_bucket_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clips'
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR public.rls_is_players_team_coach(public.clip_object_player_id(name))
    )
  )
  WITH CHECK (
    bucket_id = 'clips'
    AND public.player_has_video_consent(public.clip_object_player_id(name))
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR public.rls_is_players_team_coach(public.clip_object_player_id(name))
    )
  );

DROP POLICY IF EXISTS "clips_bucket_delete" ON storage.objects;
CREATE POLICY "clips_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clips'
    AND public.clip_object_player_id(name) IS NOT NULL
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR public.rls_is_players_team_coach(public.clip_object_player_id(name))
      OR (
        public.rls_is_player_self(public.clip_object_player_id(name))
        AND public.rls_is_own_clip_video(name)
      )
    )
  );

-- Lessons bucket: same write set as clips (direct + team coach), keep consent.
DROP POLICY IF EXISTS "lessons_coach_insert" ON storage.objects;
CREATE POLICY "lessons_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lessons'
              AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.rls_my_coached_player_ids() AS id)
              AND public.player_has_video_consent(public.clip_object_player_id(name)));

DROP POLICY IF EXISTS "lessons_coach_delete" ON storage.objects;
CREATE POLICY "lessons_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lessons'
         AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.rls_my_coached_player_ids() AS id));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT 'roster-only players' AS item, count(*)::bigint AS n
  FROM public.players WHERE user_id IS NULL
UNION ALL
SELECT 'consent coach_is_guardian', count(*)
  FROM public.player_video_consents WHERE kind = 'coach_is_guardian'
UNION ALL
SELECT 'consent coach_has_written_permission', count(*)
  FROM public.player_video_consents WHERE kind = 'coach_has_written_permission'
UNION ALL
SELECT '043 players_refuse_under_13_coach_insert', count(*)
  FROM pg_trigger WHERE tgname = 'players_refuse_under_13_coach_insert' AND NOT tgisinternal
UNION ALL
SELECT '043 lessons_require_video_consent', count(*)
  FROM pg_trigger WHERE tgname = 'lessons_require_video_consent' AND NOT tgisinternal
UNION ALL
SELECT 'player_has_video_consent roster-aware',
       CASE WHEN prosrc LIKE '%user_id IS NULL%' AND prosrc LIKE '%player_video_consents%' THEN 1 ELSE 0 END
  FROM pg_proc WHERE proname = 'player_has_video_consent'
UNION ALL
SELECT 'duplicate normalized emails (index skipped if > 0)', count(*)
  FROM (
    SELECT lower(btrim(email))
      FROM public.players
     WHERE email IS NOT NULL
     GROUP BY 1
    HAVING count(*) > 1
  ) d
UNION ALL
SELECT 'players_email_normalized_unique', count(*)
  FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'players_email_normalized_unique'
ORDER BY 1;
