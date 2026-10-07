-- ============================================================================
-- PROD PASTE for ReleasePoint (Supabase project ref: zebjtcamfpqtitkdiiig)
-- Invite-only signup hotfix (migration 042). Paste-ready for the Supabase
-- SQL editor: the Before User Created hook function, its grants, and the
-- handle_new_user change. Idempotent (CREATE OR REPLACE). Safe to re-run.
--
-- After running this, enable the hook in the dashboard:
--   Authentication > Hooks > Before User Created > Postgres function
--   > public.before_user_created_invite_check
-- ============================================================================

-- ── 1. Before User Created hook ─────────────────────────────────────────────
-- Allows creation only when the pending user's email matches (case-insensitive,
-- trimmed) an unlinked players.email row or a pending coach_invites.email row.
-- Both invite flows insert their row BEFORE calling generateLink, so invited
-- emails pass. Existing users and sign-ins are unaffected: the hook only runs
-- when a NEW user would be created.
CREATE OR REPLACE FUNCTION public.before_user_created_invite_check(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
BEGIN
  IF v_email <> '' AND (
    EXISTS (SELECT 1 FROM public.players
             WHERE user_id IS NULL AND lower(btrim(email)) = v_email)
    OR EXISTS (SELECT 1 FROM public.coach_invites
                WHERE accepted_at IS NULL AND lower(btrim(email)) = v_email)
  ) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Signup is invite-only. Ask your coach for an invite, or join the waitlist.'
    )
  );
END;
$$;

-- ── 2. Hook grants (per the Supabase hook docs) ─────────────────────────────
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.before_user_created_invite_check(jsonb) TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.before_user_created_invite_check(jsonb) FROM PUBLIC, anon, authenticated;

-- ── 3. handle_new_user(): never trust the signup role ────────────────────────
-- raw_user_meta_data is client-controlled, so every new profile starts as
-- 'player'. The coach-invite accept path (auth/callback -> acceptCoachInvite)
-- upgrades invited coaches afterwards.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    'player'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
