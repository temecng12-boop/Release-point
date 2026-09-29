-- ============================================================================
-- Migration 016: row-level security for the `clips` storage bucket (RP-041)
-- ============================================================================
-- DRAFT. Written from the repo only; review against the live storage policies
-- before applying. RLS policies are OR'ed together, so any broader policy that
-- already exists on storage.objects for this bucket (for example one added in
-- the dashboard) would still let requests through. List them first:
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
--
-- Depends on 014 (tightened RLS) and 015 (player_has_video_consent).
--
-- Path layout in the `clips` bucket, from the app code:
--   <playerId>/<timestamp>.<ext>          clip video    (upload-button, record-button)
--   <playerId>/<clipId>/voice.<ext>       coach voice   (voice-note.tsx)
--   <playerId>/<clipId>/lesson.<ext>      coach lesson  (video-player.tsx)
--   avatars/<userId>.<ext>                avatars       (uploadAvatar, service role only)
-- No other bucket receives player media. Avatars through the app use the
-- `profiles` bucket policies from 008, and uploadAvatar writes to `clips`
-- with the service role.
--
-- IMPORTANT: the service role bypasses RLS. Most media traffic goes through
-- the service role:
--   * getSignedUploadUrl creates signed upload URLs with the service role, and
--     uploads to a signed URL are authorized by the token, not by these
--     policies. The server checks (canUploadForPlayer, checkUploadConsent,
--     storage path checks) are what protect that path.
--   * createSignedUrl on the server, and every service-role remove(), also
--     skip these policies.
-- These policies govern requests made with a user JWT (the browser client or
-- the user-scoped server client). In the current code that is:
--   * browser createSignedUrl for voice and lesson playback (SELECT),
--   * deleteClip's storage remove() calls (DELETE),
--   * any direct PostgREST / storage API call someone makes with their own JWT.
--
-- Rules, mirroring the clips table policies in 002 as left by 014:
--   read:   the player's own coach, the player, a linked guardian
--   insert: the player's own coach (any object under the player's folder);
--           the player, for their own top-level clip files only. Both only
--           when the player has an 18+ confirmation or guardian consent (015).
--   update: the player's own coach
--   delete: the player's own coach; the player, only for a clip video they
--           uploaded themself (matches deleteClip: uploader or coach)
-- Paths that don't start with a player id (e.g. avatars/) get no end-user
-- access here; they stay service-role only.
--
-- Idempotent: CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- ============================================================================

-- The bucket must be private. Creates it only if it doesn't exist; an existing
-- bucket's settings are left unchanged (check `public` is false on live).
INSERT INTO storage.buckets (id, name, public)
VALUES ('clips', 'clips', false)
ON CONFLICT (id) DO NOTHING;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Player id from an object path `<playerId>/...`, or NULL for anything else
-- (including paths with `..`, a leading `/`, or a single segment).
CREATE OR REPLACE FUNCTION public.clip_object_player_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_name IS NULL
      OR p_name LIKE '/%'
      OR position('..' IN p_name) > 0
      OR position('/' IN p_name) = 0
      THEN NULL
    WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN split_part(p_name, '/', 1)::uuid
    ELSE NULL
  END
$$;

-- True for `<playerId>/<file>` (a top-level clip file), false for deeper paths.
CREATE OR REPLACE FUNCTION public.clip_object_is_top_level(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_name IS NOT NULL
     AND array_length(string_to_array(p_name, '/'), 1) = 2
     AND split_part(p_name, '/', 2) <> ''
$$;

-- SECURITY DEFINER lookups so storage policies don't depend on (or recurse
-- through) the players / guardians / clips policies.
CREATE OR REPLACE FUNCTION public.rls_is_players_coach(p_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player_id AND coach_id IS NOT NULL AND coach_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.rls_is_player_self(p_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player_id AND user_id IS NOT NULL AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.rls_is_player_guardian(p_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    JOIN public.guardians g ON g.id = p.guardian_id
    WHERE p.id = p_player_id AND g.user_id IS NOT NULL AND g.user_id = auth.uid()
  )
$$;

-- True if the object is the video of a clip the current user uploaded.
CREATE OR REPLACE FUNCTION public.rls_is_own_clip_video(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clips
    WHERE storage_path = p_name AND uploaded_by = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.rls_is_players_coach(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_is_player_self(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_is_player_guardian(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_is_own_clip_video(text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_is_players_coach(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_player_self(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_player_guardian(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_own_clip_video(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clip_object_player_id(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.clip_object_is_top_level(text) TO authenticated;

-- ── Policies on storage.objects (bucket `clips`) ─────────────────────────────
DROP POLICY IF EXISTS "clips_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "clips_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "clips_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "clips_bucket_delete" ON storage.objects;

CREATE POLICY "clips_bucket_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clips'
    AND public.clip_object_player_id(name) IS NOT NULL
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR public.rls_is_player_self(public.clip_object_player_id(name))
      OR public.rls_is_player_guardian(public.clip_object_player_id(name))
    )
  );

CREATE POLICY "clips_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clips'
    AND public.clip_object_player_id(name) IS NOT NULL
    AND public.player_has_video_consent(public.clip_object_player_id(name))
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR (
        public.rls_is_player_self(public.clip_object_player_id(name))
        AND public.clip_object_is_top_level(name)
      )
    )
  );

CREATE POLICY "clips_bucket_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clips'
    AND public.rls_is_players_coach(public.clip_object_player_id(name))
  )
  WITH CHECK (
    bucket_id = 'clips'
    AND public.player_has_video_consent(public.clip_object_player_id(name))
    AND public.rls_is_players_coach(public.clip_object_player_id(name))
  );

CREATE POLICY "clips_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clips'
    AND public.clip_object_player_id(name) IS NOT NULL
    AND (
      public.rls_is_players_coach(public.clip_object_player_id(name))
      OR (
        public.rls_is_player_self(public.clip_object_player_id(name))
        AND public.rls_is_own_clip_video(name)
      )
    )
  );
