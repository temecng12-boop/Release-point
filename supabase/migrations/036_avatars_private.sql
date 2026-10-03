-- ============================================================================
-- Migration 036: make the profiles storage bucket private
-- ============================================================================
-- Profile photos are uploaded by the server (service role) to the private
-- clips bucket at avatars/<userId>.<ext>, and profiles.avatar_url now stores
-- that path. Pages show photos through short-lived (1 hour) signed URLs made on
-- the server. Old photos in the profiles bucket are signed the same way (the
-- service role can sign objects in a private bucket), so nothing needs the
-- public bucket any more.
--
-- This migration:
--   * sets storage.buckets.public = false for 'profiles' (stops the
--     /storage/v1/object/public/profiles/... URLs from working);
--   * drops 008's policies on the profiles bucket: "Public read avatars"
--     (anyone, including anon, could list and read every photo), "Users can
--     upload own avatar" and "Users can update own avatar" (unused: uploads go
--     through the service role).
-- Files in the bucket are not touched; see avatars-count.sql and the move
-- plan in the PR for copying them into clips/avatars/.
--
-- Deploy the app version that signs avatar URLs BEFORE running this.
-- Needs migration 035 (and the private clips bucket from 024).
-- A pre-check stops with "Nothing was changed" if a prerequisite is missing; a
-- post-check rolls back if any other storage policy still opens the profiles
-- bucket. Safe to re-run. One transaction.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lessons_team_coach_select')
     OR to_regprocedure('public.rls_my_direct_player_ids_text()') IS NULL THEN
    RAISE EXCEPTION 'Migration 036 needs migration 035 (legacy policy cleanup) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'clips' AND public = false) THEN
    RAISE EXCEPTION 'Migration 036 needs the private clips bucket (migration 024), where profile photos are stored. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

UPDATE storage.buckets SET public = false WHERE id = 'profiles' AND public IS DISTINCT FROM false;

DROP POLICY IF EXISTS "Public read avatars"         ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

DO $$
DECLARE
  others text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO others
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (coalesce(qual, '') ~ '''profiles''' OR coalesce(with_check, '') ~ '''profiles''');
  IF others IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 036: other storage policies still open the profiles bucket (%). Nothing was changed.', others
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profiles' AND public IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Migration 036: the profiles bucket is still public. Nothing was changed.' USING ERRCODE = 'P0001';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Result (one row): bucket private, 008's avatar policies gone.
SELECT coalesce((SELECT NOT public FROM storage.buckets WHERE id = 'profiles'), true) AS profiles_bucket_private,
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'storage' AND tablename = 'objects'
                      AND policyname IN ('Public read avatars', 'Users can upload own avatar', 'Users can update own avatar')) AS avatar_policies_gone;
