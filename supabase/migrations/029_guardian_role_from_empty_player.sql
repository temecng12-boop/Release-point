-- 029_guardian_role_from_empty_player: let recordConsent turn an unused 'player'
-- profile into a 'guardian' profile, and nothing else.
--
-- Why: handle_new_user() gives every new account a profile with role 'player'
-- (or 'coach'), so a parent who signs up from the consent link already has a
-- 'player' profile. recordConsent inserts a guardian profile only when none
-- exists, so it never overwrites a real role. This function covers the one safe
-- upgrade: an account that is 'player' in name only.
--
-- public.promote_empty_player_to_guardian(uid) sets role = 'guardian' only when
-- ALL of these hold, and returns true when it did:
--   * the profile's role is 'player';
--   * the user is linked to a guardians row (guardians.user_id = uid), which
--     recordConsent writes just before calling this;
--   * no players row has user_id = uid;
--   * the user has no data in any user-owned table:
--       players (user_id, coach_id, adult_confirmed_by when present),
--       clips (uploaded_by), annotations (created_by), timestamp_notes
--       (created_by), pitch_metrics (created_by), pitch_analysis (coach_id),
--       bullpen_sessions (coach_id), teams (coach_id), team_coaches (coach_id),
--       guardians (created_by), lessons (coach_id, when present),
--       feedback_reports (user_id, when present), storage.objects (owner /
--       owner_id), and any other public column with a foreign key to
--       auth.users(id) or profiles(id) except profiles.id and guardians.user_id;
--       player_teams has no user column and is reached only through players;
--   * the profile's optional fields (team_name, avatar_url, bio, college,
--     playing_career, coaching_since, certifications, location, social_*) are
--     empty.
-- Otherwise the role is left alone and false is returned.
--
-- The profile row is locked (FOR UPDATE) for the whole check, and the final
-- UPDATE repeats the core checks in its WHERE clause, so the role changes in a
-- single conditional statement.
--
-- Only service_role may call it (recordConsent uses the admin client). It runs
-- as the caller (SECURITY INVOKER); service_role bypasses RLS, and the
-- profiles_prevent_role_change trigger allows non-end-user requests.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.promote_empty_player_to_guardian(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  spec record;
  has_rows boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND role = 'player' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Optional tables and columns (other branches' migrations, storage, and any
  -- foreign key to auth.users / profiles) are checked dynamically so this runs
  -- whether or not they exist yet.
  FOR spec IN
    SELECT DISTINCT s.sch, s.tbl, s.col, s.is_text
      FROM (
        SELECT v.sch, v.tbl, v.col, v.is_text
          FROM (VALUES
            ('public',  'lessons',          'coach_id',           false),
            ('public',  'feedback_reports', 'user_id',            false),
            ('public',  'players',          'adult_confirmed_by', false),
            ('storage', 'objects',          'owner',              false),
            ('storage', 'objects',          'owner_id',           true)
          ) AS v(sch, tbl, col, is_text)
          JOIN pg_catalog.pg_namespace n ON n.nspname = v.sch
          JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = v.tbl AND c.relkind IN ('r', 'p')
          JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = v.col AND NOT a.attisdropped
        UNION ALL
        SELECT n.nspname::text, c.relname::text, a.attname::text, false
          FROM pg_catalog.pg_constraint k
          JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
         WHERE k.contype = 'f'
           AND n.nspname = 'public'
           AND array_length(k.conkey, 1) = 1
           AND k.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
           AND NOT (c.relname = 'profiles' AND a.attname = 'id')
           AND NOT (c.relname = 'guardians' AND a.attname = 'user_id')
      ) AS s
  LOOP
    IF spec.is_text THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1::text)', spec.sch, spec.tbl, spec.col)
        INTO has_rows USING p_user_id;
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', spec.sch, spec.tbl, spec.col)
        INTO has_rows USING p_user_id;
    END IF;
    IF has_rows THEN
      RETURN false;
    END IF;
  END LOOP;

  UPDATE public.profiles p
     SET role = 'guardian'
   WHERE p.id = p_user_id
     AND p.role = 'player'
     AND EXISTS (SELECT 1 FROM public.guardians g WHERE g.user_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.players          WHERE user_id = p_user_id OR coach_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.clips            WHERE uploaded_by = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.annotations      WHERE created_by = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.timestamp_notes  WHERE created_by = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.pitch_metrics    WHERE created_by = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.pitch_analysis   WHERE coach_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.bullpen_sessions WHERE coach_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.teams            WHERE coach_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.team_coaches     WHERE coach_id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.guardians        WHERE created_by = p_user_id)
     AND p.team_name IS NULL AND p.avatar_url IS NULL AND p.bio IS NULL
     AND p.college IS NULL AND p.playing_career IS NULL AND p.coaching_since IS NULL
     AND COALESCE(cardinality(p.certifications), 0) = 0
     AND p.location IS NULL AND p.social_twitter IS NULL
     AND p.social_instagram IS NULL AND p.social_linkedin IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_empty_player_to_guardian(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_empty_player_to_guardian(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_empty_player_to_guardian(uuid) TO service_role;

-- Check: expect callable_by_service = true, callable_by_authenticated = false.
SELECT has_function_privilege('service_role', 'public.promote_empty_player_to_guardian(uuid)', 'EXECUTE') AS callable_by_service,
       has_function_privilege('authenticated', 'public.promote_empty_player_to_guardian(uuid)', 'EXECUTE') AS callable_by_authenticated;
